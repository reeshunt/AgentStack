import type { SDKMessage, SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk'

export type QuotaInfo = SDKRateLimitInfo

export type Project = {
  id: string
  name: string
  path: string
  addedAt: number
}

export type AgentInfo = {
  /** Frontmatter `name` — the agent's identity, applied via a system-prompt override */
  name: string
  description?: string
  model?: string
  color?: string
  /** AgentStack-only convenience field, additive to the frontmatter contract */
  icon?: string
  /** AgentStack-only convenience field: groups desks on the floor by department */
  department?: string
  filePath: string
}

export type NewAgentInput = {
  name: string
  description: string
  model: string
  color: string
  icon?: string
  department?: string
  systemPrompt: string
}

export type SessionStatus = 'idle' | 'thinking' | 'running' | 'needs_input' | 'error' | 'done'

export type StreamedMessage = SDKMessage | { type: 'local_error'; error: string }

export type SessionEvent = {
  key: string
  status: SessionStatus
  message: StreamedMessage
}

/** Progress event for the one-off "Generate Agents" project-analysis run. */
export type GenerateEvent = {
  key: string
  message: StreamedMessage
}

/** A user-created group of agents on one project's floor (manual, via multi-select). */
export type AgentGroup = {
  id: string
  projectId: string
  name: string
  agentNames: string[]
}

export type PermissionMode = 'confirm' | 'auto'

/** A tool call awaiting the user's approve/deny decision (confirm-mode only). */
export type PermissionRequest = {
  key: string
  toolUseID: string
  toolName: string
  toolInput: unknown
}

export type ClaudeCliStatus = {
  available: boolean
  version?: string
  error?: string
}

export function sessionKey(projectId: string, agentName: string): string {
  return `${projectId}::${agentName}`
}
