import type { Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { PushQueue } from '../pushQueue'
import { readAgentPrompt } from '../agents'
import { clearSessionId, getSavedSessionId, saveSessionId } from '../sessionStore'
import { forwardQuota } from '../quota'
import { requestPermission } from '../permissions'
import { appEvents } from '../events/AppEventBus'
import { getAgentProvider } from '../providers'
import type { AgentProvider } from '../providers'
import { PromptFactory } from '../prompts/PromptFactory'
import { toolRegistry } from '../tools/ToolRegistry'
import { sessionKey } from '../../shared/types'
import type { SessionStatus } from '../../shared/types'

type SessionState = {
  key: string
  projectId: string
  projectPath: string
  agentName: string
  input: PushQueue<SDKUserMessage>
  handle: Query
  status: SessionStatus
  sessionId?: string
  resumed: boolean
}

/** Result of one delegated turn, resolved from the target session's own `result` message
 *  so the Floor Manager's `delegate_task` tool can await a worker agent actually finishing. */
export type DelegationResult = {
  ok: boolean
  resultText: string
  contextPct: number
  costUsd: number
  numTurns: number
}

type DelegationWaiter = { resolve: (result: DelegationResult) => void }

export type EnsureSessionParams = {
  projectId: string
  projectPath: string
  agentName: string
  /** Named MCP tool sets (see `ToolRegistry`) to wire into this session on first creation. */
  toolSetIds?: string[]
  /** Extra system-prompt text appended after the identity lock, on first creation. */
  delegationBriefing?: string
  /** Extra disallowed tools, on first creation. */
  extraDisallowedTools?: string[]
}

export type HistoryTurn = { role: 'user' | 'assistant'; text: string }

/**
 * Service layer for agent sessions. This is the only part of the app that touches an
 * `AgentProvider` (the model-backend strategy) or assembles a session's system prompt/tools —
 * IPC handlers in `index.ts` and the orchestration layer only ever call methods here, never
 * `@anthropic-ai/claude-agent-sdk` directly. Session lifecycle (in-memory `Map`s) is instance
 * state rather than module-level closures, and every cross-cutting notification goes out
 * through `AppEventBus` instead of a `BrowserWindow` reference.
 */
export class SessionService {
  private readonly sessions = new Map<string, SessionState>()
  private readonly pending = new Map<string, Promise<SessionState>>()

  // FIFO per session key — if a worker agent is delegated to more than once back-to-back,
  // each `awaitAgentResult` call is resolved by the next `result` message in call order.
  private readonly delegationWaiters = new Map<string, DelegationWaiter[]>()

  constructor(private readonly provider: AgentProvider = getAgentProvider()) {}

  getSession(projectId: string, agentName: string): SessionState | undefined {
    return this.sessions.get(sessionKey(projectId, agentName))
  }

  /** Registers a waiter for the next `result` message on this session key. Registration is
   *  synchronous (the executor runs immediately), so callers can safely call this before
   *  `sendPrompt` without racing the SDK's own processing of that prompt. */
  awaitAgentResult(key: string): Promise<DelegationResult> {
    return new Promise((resolve) => {
      const waiters = this.delegationWaiters.get(key) ?? []
      waiters.push({ resolve })
      this.delegationWaiters.set(key, waiters)
    })
  }

  /** True when an error message indicates the resumed session's transcript no longer exists
   *  on disk (e.g. deleted, moved project, or corrupted history) — the resume id is dead and
   *  must be discarded rather than retried forever. */
  private isStaleResumeError(text: string): boolean {
    return /no conversation found with session id/i.test(text)
  }

  /** Drops a session that failed to resume: clears the saved session id and removes the
   *  live (now-dead) session state so the next `ensureSession` call starts a brand-new
   *  conversation instead of retrying the same broken resume id forever. */
  private discardStaleSession(key: string): void {
    clearSessionId(key)
    this.sessions.delete(key)
  }

  private deriveStatus(message: SDKMessage, previous: SessionStatus): SessionStatus {
    switch (message.type) {
      case 'assistant': {
        if (message.error) return 'error'
        const blocks = message.message.content
        const hasToolUse = Array.isArray(blocks) && blocks.some((b) => b.type === 'tool_use')
        return hasToolUse ? 'running' : 'thinking'
      }
      case 'result':
        return message.is_error ? 'error' : 'done'
      default:
        return previous
    }
  }

  private async createSession(params: EnsureSessionParams): Promise<SessionState> {
    const { projectId, projectPath, agentName, toolSetIds, delegationBriefing, extraDisallowedTools } =
      params
    const key = sessionKey(projectId, agentName)

    // `Options.agent` does not reliably switch the main thread's persona (verified
    // against a real project - it stays on the default "claude" orchestrator with
    // the subagent merely listed as available). Read the agent's own markdown body
    // and drive the persona directly via `systemPrompt` instead.
    const prompt = await readAgentPrompt(projectPath, agentName)
    const resumeId = getSavedSessionId(key)
    const mcpServers = toolSetIds?.length
      ? toolRegistry.build(toolSetIds, { projectId, projectPath, agentName })
      : undefined

    const input = new PushQueue<SDKUserMessage>()
    const handle = this.provider.startQuery({
      cwd: projectPath,
      input,
      systemPrompt: PromptFactory.createSystemPrompt({
        agentName,
        basePrompt: prompt?.systemPrompt,
        delegationBriefing
      }),
      tools: prompt?.tools,
      mcpServers,
      disallowedTools: extraDisallowedTools,
      resumeSessionId: resumeId,
      canUseTool: async (toolName, toolInput, { signal, toolUseID }) => {
        state.status = 'needs_input'
        const result = await requestPermission(key, projectId, toolName, toolInput, toolUseID, signal)
        state.status = 'running'
        return result
      }
    })

    const state: SessionState = {
      key,
      projectId,
      projectPath,
      agentName,
      input,
      handle,
      status: 'idle',
      sessionId: resumeId,
      resumed: Boolean(resumeId)
    }
    this.sessions.set(key, state)

    void (async () => {
      try {
        for await (const message of handle) {
          state.status = this.deriveStatus(message, state.status)
          if ('session_id' in message && message.session_id && message.session_id !== state.sessionId) {
            state.sessionId = message.session_id
            saveSessionId(key, message.session_id)
          }
          forwardQuota(message)

          if (message.type === 'result' && message.is_error) {
            const text = message.subtype === 'success' ? message.result : message.errors.join('; ')
            if (this.isStaleResumeError(text ?? '')) this.discardStaleSession(key)
          }

          if (message.type === 'result') {
            const waiter = this.delegationWaiters.get(key)?.shift()
            if (waiter) {
              const primaryUsage = Object.values(message.modelUsage ?? {})[0]
              const contextPct = primaryUsage
                ? Math.min(
                    100,
                    Math.round(
                      (100 *
                        (primaryUsage.inputTokens +
                          primaryUsage.cacheReadInputTokens +
                          primaryUsage.cacheCreationInputTokens)) /
                        primaryUsage.contextWindow
                    )
                  )
                : 0
              waiter.resolve({
                ok: !message.is_error,
                resultText:
                  message.subtype === 'success' ? message.result : message.errors.join('; '),
                contextPct,
                costUsd: message.total_cost_usd,
                numTurns: message.num_turns
              })
            }
          }

          appEvents.emit('session:event', { key, status: state.status, message })
        }
      } catch (err) {
        state.status = 'error'
        const errorText = err instanceof Error ? err.message : String(err)
        const stale = this.isStaleResumeError(errorText)
        if (stale) this.discardStaleSession(key)
        appEvents.emit('session:event', {
          key,
          status: 'error',
          message: {
            type: 'local_error',
            error: stale
              ? 'This conversation history was no longer available, so its session was cleared. Select the agent again to start fresh.'
              : errorText
          }
        })
      }
    })()

    return state
  }

  /** Creates the session if it doesn't exist yet; otherwise returns the existing one.
   *  `toolSetIds`/`delegationBriefing`/`extraDisallowedTools` only take effect on first
   *  creation — they're the Floor Manager's delegation wiring, briefing, and the hard
   *  restriction that keeps it from doing implementation work itself — ignored for an
   *  already-live session. */
  async ensureSession(params: EnsureSessionParams): Promise<SessionState> {
    const key = sessionKey(params.projectId, params.agentName)
    const existing = this.sessions.get(key)
    if (existing) return existing

    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight

    const creation = this.createSession(params).finally(() => {
      this.pending.delete(key)
    })
    this.pending.set(key, creation)
    return creation
  }

  sendPrompt(state: SessionState, text: string): void {
    state.status = 'thinking'
    state.input.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null
    })
  }

  async interruptSession(state: SessionState): Promise<void> {
    await state.handle.interrupt()
  }

  closeSession(state: SessionState): void {
    state.input.close()
    state.handle.close()
    this.sessions.delete(state.key)
  }

  /** "Clear session" — tears down the live SDK session (if any) and forgets its resume id,
   *  so the next prompt for this (project, agent) pair starts a brand-new conversation with
   *  no memory of anything said before, back at the agent's original defined role. */
  resetSession(projectId: string, agentName: string): void {
    const key = sessionKey(projectId, agentName)
    const state = this.sessions.get(key)
    if (state) this.closeSession(state)
    clearSessionId(key)
  }

  /** Flattened prior transcript for hydrating the chat panel on a resumed session. Text only —
   *  tool calls are not replayed into the UI on resume. */
  async loadHistory(projectPath: string, sessionId: string): Promise<HistoryTurn[]> {
    return this.provider.loadHistory(projectPath, sessionId)
  }
}

/** Process-wide singleton, matching the previous module-level session map's lifetime. */
export const sessionService = new SessionService()
