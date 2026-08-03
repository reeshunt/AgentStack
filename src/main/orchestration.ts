import { randomUUID } from 'node:crypto'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { BrowserWindow } from 'electron'
import { z } from 'zod'
import { listAgents } from './agents'
import { awaitAgentResult, ensureSession, sendPrompt } from './sessions'
import { sessionKey, type AgentInfo, type OrchestrationEvent } from '../shared/types'

/** Tools that would let the Floor Manager do implementation work directly instead of
 *  delegating it. Hard-blocked via `Options.disallowedTools` (not just prompted against) —
 *  a soft instruction alone isn't reliable, a model will reach for a tool it actually has
 *  over one it's merely told not to use. Read/search/ask tools stay available so it can
 *  still gather context and ask clarifying questions.
 *
 *  `Agent` (the SDK's own built-in subagent dispatcher, shown to users as "the Task tool")
 *  is included deliberately: without it, a Floor Manager can spin up an anonymous ephemeral
 *  subagent that gets its own Bash access, bypassing `delegate_task` entirely and doing the
 *  work itself under a different name — confirmed happening in real usage, where the model
 *  used `Agent` to run git commands directly instead of delegating to the GitHub Agent's own
 *  (visible, persistent) desk session. */
export const FLOOR_MANAGER_DISALLOWED_TOOLS = ['Bash', 'Write', 'Edit', 'NotebookEdit', 'Agent']

/** Appended to the Floor Manager's own system prompt so it knows who it can delegate to
 *  and how to use the `delegate_task` tool, instead of trying to do specialist work itself. */
export function buildDelegationBriefing(roster: AgentInfo[]): string {
  if (roster.length === 0) return ''

  const lines = roster.map(
    (a) => `- ${a.name}${a.department ? ` (${a.department})` : ''}: ${a.description ?? 'no description'}`
  )
  return `You are the Floor Manager for this project. This session has no ${FLOOR_MANAGER_DISALLOWED_TOOLS.join('/')} access — that's intentional, not a limitation to route around. Any task needing one of those requires a delegation, full stop. When a task calls for a specialist, delegate it via the \`delegate_task\` tool — it hands the task to the named agent's own session and returns once that agent has actually finished, along with how much of its context/budget the task used. Agents currently on the floor:
${lines.join('\n')}

Wait for each \`delegate_task\` call to resolve before telling the user the task is done, and summarize what each delegated agent actually did. If the user hands you two or more independent tasks that belong to different agents, do not call \`delegate_task\` for one, wait, then call it again for the next — that runs them back-to-back for no reason. Call \`delegate_tasks_parallel\` once with all of them instead, so the agents actually work at the same time. Only fall back to individual \`delegate_task\` calls when there's just one task, or later tasks genuinely depend on an earlier one's result.`
}

/** Delegates one task to one worker agent's own persistent session and awaits that agent's
 *  next completed turn. Shared by both `delegate_task` and `delegate_tasks_parallel` — the
 *  only difference between the two tools is how many of these run concurrently. */
async function delegateOne(
  projectId: string,
  projectPath: string,
  fmAgentName: string,
  win: BrowserWindow,
  agentName: string,
  task: string
): Promise<{ text: string; isError: boolean }> {
  const roster = await listAgents(projectPath)
  const target = roster.find((a) => a.name === agentName)
  if (!target) {
    return {
      text: `No agent named "${agentName}" exists on this floor. Available agents: ${roster.map((a) => a.name).join(', ') || '(none)'}`,
      isError: true
    }
  }

  const delegationId = randomUUID()
  const targetKey = sessionKey(projectId, agentName)
  const targetState = await ensureSession(projectId, projectPath, agentName, win)

  if (!win.isDestroyed()) {
    const event: OrchestrationEvent = {
      id: delegationId,
      projectId,
      from: fmAgentName,
      to: agentName,
      status: 'active',
      task
    }
    win.webContents.send('orchestration:event', event)
  }

  // Registered before sendPrompt so we can't miss the result — see awaitAgentResult's docs.
  const resultPromise = awaitAgentResult(targetKey)
  sendPrompt(targetState, `[Delegated by ${fmAgentName}]: ${task}`)
  const result = await resultPromise

  if (!win.isDestroyed()) {
    const event: OrchestrationEvent = {
      id: delegationId,
      projectId,
      from: fmAgentName,
      to: agentName,
      status: result.ok ? 'done' : 'error',
      stats: {
        resultText: result.resultText,
        contextPct: result.contextPct,
        costUsd: result.costUsd,
        numTurns: result.numTurns
      }
    }
    win.webContents.send('orchestration:event', event)
  }

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
export function buildDelegationMcpServer(
  projectId: string,
  projectPath: string,
  fmAgentName: string,
  win: BrowserWindow
): Record<string, McpServerConfig> {
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
      const result = await delegateOne(projectId, projectPath, fmAgentName, win, agentName, task)
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
        delegations.map(({ agentName, task }) =>
          delegateOne(projectId, projectPath, fmAgentName, win, agentName, task)
        )
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
