import { getSessionMessages, query } from '@anthropic-ai/claude-agent-sdk'
import type { Query } from '@anthropic-ai/claude-agent-sdk'
import type { AgentProvider, AgentQueryOptions, HistoryTurn } from './types'

/** Concrete strategy backing sessions with Anthropic's Claude Agent SDK. */
export class ClaudeAgentProvider implements AgentProvider {
  readonly id = 'claude'

  startQuery(options: AgentQueryOptions): Query {
    return query({
      prompt: options.input,
      options: {
        cwd: options.cwd,
        systemPrompt: options.systemPrompt,
        tools: options.tools,
        mcpServers: options.mcpServers,
        disallowedTools: options.disallowedTools,
        resume: options.resumeSessionId,
        permissionMode: 'default',
        canUseTool: options.canUseTool
      }
    })
  }

  async loadHistory(cwd: string, sessionId: string): Promise<HistoryTurn[]> {
    const messages = await getSessionMessages(sessionId, { dir: cwd })
    const items: HistoryTurn[] = []

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
}
