import { getSessionMessages, query } from '@anthropic-ai/claude-agent-sdk'
import type { Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { BrowserWindow } from 'electron'
import { PushQueue } from './pushQueue'
import { readAgentPrompt } from './agents'
import { getSavedSessionId, saveSessionId } from './sessionStore'
import { forwardQuota } from './quota'
import { requestPermission } from './permissions'
import { sessionKey } from '../shared/types'
import type { SessionStatus } from '../shared/types'

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

const sessions = new Map<string, SessionState>()
const pending = new Map<string, Promise<SessionState>>()

function deriveStatus(message: SDKMessage, previous: SessionStatus): SessionStatus {
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

export function getSession(projectId: string, agentName: string): SessionState | undefined {
  return sessions.get(sessionKey(projectId, agentName))
}

async function createSession(
  projectId: string,
  projectPath: string,
  agentName: string,
  win: BrowserWindow
): Promise<SessionState> {
  const key = sessionKey(projectId, agentName)

  // `Options.agent` does not reliably switch the main thread's persona (verified
  // against a real project - it stays on the default "claude" orchestrator with
  // the subagent merely listed as available). Read the agent's own markdown body
  // and drive the persona directly via `systemPrompt` instead.
  const prompt = await readAgentPrompt(projectPath, agentName)
  const resumeId = getSavedSessionId(key)

  const input = new PushQueue<SDKUserMessage>()
  const handle = query({
    prompt: input,
    options: {
      cwd: projectPath,
      systemPrompt: prompt?.systemPrompt,
      tools: prompt?.tools,
      resume: resumeId,
      permissionMode: 'default',
      canUseTool: async (toolName, toolInput, { signal, toolUseID }) => {
        state.status = 'needs_input'
        const result = await requestPermission(win, key, projectId, toolName, toolInput, toolUseID, signal)
        state.status = 'running'
        return result
      }
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
  sessions.set(key, state)

  void (async () => {
    try {
      for await (const message of handle) {
        state.status = deriveStatus(message, state.status)
        if ('session_id' in message && message.session_id && message.session_id !== state.sessionId) {
          state.sessionId = message.session_id
          saveSessionId(key, message.session_id)
        }
        forwardQuota(win, message)
        if (win.isDestroyed()) continue
        win.webContents.send('session:event', { key, status: state.status, message })
      }
    } catch (err) {
      state.status = 'error'
      if (!win.isDestroyed()) {
        win.webContents.send('session:event', {
          key,
          status: 'error',
          message: { type: 'local_error', error: err instanceof Error ? err.message : String(err) }
        })
      }
    }
  })()

  return state
}

/** Creates the session if it doesn't exist yet; otherwise returns the existing one. */
export async function ensureSession(
  projectId: string,
  projectPath: string,
  agentName: string,
  win: BrowserWindow
): Promise<SessionState> {
  const key = sessionKey(projectId, agentName)
  const existing = sessions.get(key)
  if (existing) return existing

  const inFlight = pending.get(key)
  if (inFlight) return inFlight

  const creation = createSession(projectId, projectPath, agentName, win).finally(() => {
    pending.delete(key)
  })
  pending.set(key, creation)
  return creation
}

export function sendPrompt(state: SessionState, text: string): void {
  state.status = 'thinking'
  state.input.push({
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null
  })
}

export async function interruptSession(state: SessionState): Promise<void> {
  await state.handle.interrupt()
}

export function closeSession(state: SessionState): void {
  state.input.close()
  state.handle.close()
  sessions.delete(state.key)
}

/** Flattened prior transcript for hydrating the chat panel on a resumed session. Text only — tool calls are not replayed into the UI on resume. */
export async function loadHistory(
  projectPath: string,
  sessionId: string
): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> {
  const messages = await getSessionMessages(sessionId, { dir: projectPath })
  const items: Array<{ role: 'user' | 'assistant'; text: string }> = []

  for (const msg of messages) {
    if (msg.type !== 'user' && msg.type !== 'assistant') continue
    const payload = msg.message as { content?: unknown } | undefined
    const content = payload?.content
    if (typeof content === 'string') {
      if (content.trim()) items.push({ role: msg.type, text: content })
      continue
    }
    if (Array.isArray(content)) {
      for (const block of content as Array<{ type?: string; text?: string }>) {
        if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          items.push({ role: msg.type, text: block.text })
        }
      }
    }
  }
  return items
}
