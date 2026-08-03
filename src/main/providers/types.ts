import type { CanUseTool, McpServerConfig, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { PushQueue } from '../pushQueue'

/** Provider-agnostic request to start one streaming agent turn. Nothing here is
 *  Claude-specific by name — a future provider only needs to satisfy this shape. */
export type AgentQueryOptions = {
  cwd: string
  input: PushQueue<SDKUserMessage>
  systemPrompt?: string
  tools?: string[]
  mcpServers?: Record<string, McpServerConfig>
  disallowedTools?: string[]
  resumeSessionId?: string
  canUseTool: CanUseTool
}

/** One flattened transcript turn used to hydrate the chat panel on resume. */
export type HistoryTurn = { role: 'user' | 'assistant'; text: string }

/**
 * Strategy interface for the model/agent backend that powers a session. `SessionService`
 * (and everything above it) codes only against this contract, never against
 * `@anthropic-ai/claude-agent-sdk` directly — so a second provider (a different model
 * vendor, a local model, a mock for tests) can be dropped in via `providers/index.ts`
 * without touching session, orchestration, or prompt logic.
 */
export interface AgentProvider {
  readonly id: string
  startQuery(options: AgentQueryOptions): Query
  loadHistory(cwd: string, sessionId: string): Promise<HistoryTurn[]>
}
