import { randomUUID } from 'node:crypto'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { listAgents } from '../agents'
import { sessionService } from './SessionService'
import { toolRegistry, type ToolSetContext } from '../tools/ToolRegistry'
import { appEvents } from '../events/AppEventBus'
import { sessionKey, type OrchestrationEvent } from '../../shared/types'

/**
 * Service layer for cross-agent delegation. On construction it registers its `'delegation'`
 * tool set into the shared `ToolRegistry` — `SessionService` never imports this class, it just
 * asks the registry for a tool set by name, so `SessionService` and `OrchestrationService` stay
 * decoupled from each other. Every delegation status update goes out through `AppEventBus`
 * instead of a `BrowserWindow` reference.
 */
export class OrchestrationService {
  constructor() {
    toolRegistry.register('delegation', (ctx) => this.buildDelegationMcpServer(ctx))
  }

  /** Delegates one task to one worker agent's own persistent session and awaits that agent's
   *  next completed turn. Shared by both `delegate_task` and `delegate_tasks_parallel` — the
   *  only difference between the two tools is how many of these run concurrently. */
  private async delegateOne(
    ctx: ToolSetContext,
    agentName: string,
    task: string
  ): Promise<{ text: string; isError: boolean }> {
    const roster = await listAgents(ctx.projectPath)
    const target = roster.find((a) => a.name === agentName)
    if (!target) {
      return {
        text: `No agent named "${agentName}" exists on this floor. Available agents: ${roster.map((a) => a.name).join(', ') || '(none)'}`,
        isError: true
      }
    }

    const delegationId = randomUUID()
    const targetKey = sessionKey(ctx.projectId, agentName)
    const targetState = await sessionService.ensureSession({
      projectId: ctx.projectId,
      projectPath: ctx.projectPath,
      agentName
    })

    const activeEvent: OrchestrationEvent = {
      id: delegationId,
      projectId: ctx.projectId,
      from: ctx.agentName,
      to: agentName,
      status: 'active',
      task
    }
    appEvents.emit('orchestration:event', activeEvent)

    // Registered before sendPrompt so we can't miss the result — see awaitAgentResult's docs.
    const resultPromise = sessionService.awaitAgentResult(targetKey)
    sessionService.sendPrompt(targetState, `[Delegated by ${ctx.agentName}]: ${task}`)
    const result = await resultPromise

    const doneEvent: OrchestrationEvent = {
      id: delegationId,
      projectId: ctx.projectId,
      from: ctx.agentName,
      to: agentName,
      status: result.ok ? 'done' : 'error',
      stats: {
        resultText: result.resultText,
        contextPct: result.contextPct,
        costUsd: result.costUsd,
        numTurns: result.numTurns
      }
    }
    appEvents.emit('orchestration:event', doneEvent)

    return {
      text: `${agentName} finished: ${result.resultText}\n\n(used ${result.contextPct}% of its context window, $${result.costUsd.toFixed(4)}, ${result.numTurns} turn${result.numTurns === 1 ? '' : 's'})`,
      isError: !result.ok
    }
  }

  /** Builds the in-process MCP server that gives the Floor Manager real delegation tools:
   *  `delegate_task` drives one target agent's own persistent session (the same one its desk
   *  uses) and awaits that agent's next completed turn before returning. `delegate_tasks_parallel`
   *  does the same for a whole batch at once via `Promise.all`, so independent tasks handed to
   *  different agents actually run at the same time instead of one blocking the next — a worker
   *  session can only run one delegated task at a time either way, so tasks that land on the same
   *  agent still queue up naturally behind that agent's own FIFO waiter list. */
  private buildDelegationMcpServer(ctx: ToolSetContext): Record<string, McpServerConfig> {
    const delegateTool = tool(
      'delegate_task',
      "Delegate a single task to another agent on the floor and wait for it to complete. Returns the worker agent's final report plus how much of its context window and cost budget the task used. If you have two or more independent tasks for different agents, prefer delegate_tasks_parallel instead of calling this repeatedly.",
      {
        agentName: z.string().describe('Exact name of the agent on the floor to delegate to'),
        task: z
          .string()
          .describe(
            'The task to hand off, with enough detail for the worker agent to act on it without asking for clarification'
          )
      },
      async ({ agentName, task }) => {
        const result = await this.delegateOne(ctx, agentName, task)
        return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
      },
      // MCP tools are deferred behind on-demand tool search by default — the Floor Manager
      // must always see this one without having to think to search for it first.
      { alwaysLoad: true }
    )

    const delegateParallelTool = tool(
      'delegate_tasks_parallel',
      'Delegate several independent tasks to (typically different) agents on the floor all at once, and wait for all of them to complete concurrently rather than one after another. Use this instead of multiple delegate_task calls whenever the tasks do not depend on each other.',
      {
        delegations: z
          .array(
            z.object({
              agentName: z.string().describe('Exact name of the agent on the floor to delegate to'),
              task: z
                .string()
                .describe(
                  'The task to hand off, with enough detail for the worker agent to act on it without asking for clarification'
                )
            })
          )
          .min(2)
          .describe('The independent tasks to run at the same time')
      },
      async ({ delegations }) => {
        const results = await Promise.all(
          delegations.map(({ agentName, task }) => this.delegateOne(ctx, agentName, task))
        )
        return {
          content: [
            {
              type: 'text' as const,
              text: results
                .map((r, i) => `[${delegations[i].agentName}] ${r.text}`)
                .join('\n\n---\n\n')
            }
          ],
          isError: results.some((r) => r.isError)
        }
      },
      { alwaysLoad: true }
    )

    return {
      orchestration: createSdkMcpServer({
        name: 'orchestration',
        tools: [delegateTool, delegateParallelTool]
      })
    }
  }
}

/** Process-wide singleton. Constructing it registers the `'delegation'` tool set — imported
 *  once (from `index.ts`) purely for this side effect, same as the old module's top-level code. */
export const orchestrationService = new OrchestrationService()
