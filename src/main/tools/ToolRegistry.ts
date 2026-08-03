import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'

export type ToolSetContext = {
  projectId: string
  projectPath: string
  /** Name of the agent whose session these tools are being built for. */
  agentName: string
}

/** Builds the MCP servers for one named tool set, given the session it's being wired into. */
export type ToolSetFactory = (ctx: ToolSetContext) => Record<string, McpServerConfig>

/**
 * Central lookup of named, pluggable MCP tool sets (e.g. `'delegation'`). A session asks for
 * tool sets by id instead of importing and constructing them directly — new tool sets (a
 * future "web search" or "design review" bundle) register themselves here once and become
 * available to any session by name, without `SessionService` needing to know they exist.
 */
export class ToolRegistry {
  private readonly factories = new Map<string, ToolSetFactory>()

  register(id: string, factory: ToolSetFactory): void {
    this.factories.set(id, factory)
  }

  has(id: string): boolean {
    return this.factories.has(id)
  }

  /** Builds and merges every requested tool set's MCP servers for one session context. */
  build(ids: string[], ctx: ToolSetContext): Record<string, McpServerConfig> {
    let merged: Record<string, McpServerConfig> = {}
    for (const id of ids) {
      const factory = this.factories.get(id)
      if (!factory) throw new Error(`Unknown tool set "${id}"`)
      merged = { ...merged, ...factory(ctx) }
    }
    return merged
  }
}

/** Process-wide singleton — services register into this instance at module load. */
export const toolRegistry = new ToolRegistry()
