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
  /** AgentStack-only: when true, the chat UI shows a Preview panel that extracts
   *  HTML/JSX/TSX code blocks from this agent's replies as clickable mockup/wireframe screens. */
  previewUI?: boolean
  /** AgentStack-only: marks this agent as the project's orchestrator. At most one agent per
   *  project may hold this flag — it always renders first on the floor and is the only agent
   *  whose session is wired with the `delegate_task` tool for handing work to other agents. */
  isFloorManager?: boolean
  filePath: string
}

export type NewAgentInput = {
  name: string
  description: string
  model: string
  color: string
  icon?: string
  department?: string
  previewUI?: boolean
  isFloorManager?: boolean
  systemPrompt: string
}

export type SessionStatus = 'idle' | 'thinking' | 'running' | 'needs_input' | 'error' | 'done'

export type StreamedMessage = SDKMessage | { type: 'local_error'; error: string }

export type SessionEvent = {
  key: string
  status: SessionStatus
  message: StreamedMessage
}

/** UI-only per-project desk presentation: custom desk-card colors and free-form position
 *  on the floor canvas. `x`/`y` are absent until the user has dragged the card at least once. */
export type DeskLayout = {
  agentName: string
  suitColor?: string
  deskColor?: string
  x?: number
  y?: number
}

export type PermissionMode = 'confirm' | 'auto'

/** A tool call awaiting the user's approve/deny decision (confirm-mode only). */
export type PermissionRequest = {
  key: string
  toolUseID: string
  toolName: string
  toolInput: unknown
}

/** One mockup/wireframe screen extracted from an agent's reply, persisted to disk
 *  under the project's .claude/mockups/<agent>/ directory so it survives reloads
 *  and is available from any clone of the repo. */
export type MockupScreen = {
  id: string
  title: string
  lang: 'html' | 'jsx' | 'tsx' | 'react'
  code: string
}

export type ClaudeCliStatus = {
  available: boolean
  version?: string
  error?: string
}

export function sessionKey(projectId: string, agentName: string): string {
  return `${projectId}::${agentName}`
}

/** One entry in a project directory listing, shown in the File Viewer's tree. */
export type FileEntry = {
  name: string
  path: string
  isDirectory: boolean
  size: number
}

/** A delegation the Floor Manager has handed to a worker agent via `delegate_task`.
 *  Drives the animated dashed-line overlay on the floor and (once 'done'/'error') the
 *  stats card appended to the Floor Manager's own chat log. */
export type OrchestrationEvent = {
  id: string
  projectId: string
  from: string
  to: string
  status: 'active' | 'done' | 'error'
  /** Present only when status is 'active' — the task text handed to the worker agent,
   *  so its chat thread can show what it was asked to do. */
  task?: string
  /** Present only once status is 'done' or 'error'. */
  stats?: {
    resultText: string
    contextPct: number
    costUsd: number
    numTurns: number
  }
}
