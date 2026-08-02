import { query } from '@anthropic-ai/claude-agent-sdk'
import type { BrowserWindow } from 'electron'
import { forwardQuota } from './quota'

const GENERATOR_SYSTEM_PROMPT = `You are AgentStack's agent-generation assistant. Your job, in this single run, is to look at the real project in front of you and set it up with a well-matched roster of Claude Code subagents — not a generic template.

1. Explore the project (package.json / *.csproj / requirements.txt / go.mod / pubspec.yaml / directory layout, README, existing docs, CI config) to identify:
   - What kind(s) of codebase this is (web frontend, mobile app, backend/API, infra, monorepo combining several of these).
   - The concrete tech stack, frameworks, folder structure, and testing/build conventions actually in use.

2. Read every file already in \`.claude/agents/*.md\`. Do not duplicate or blindly overwrite an existing agent — skip roles that are already well covered by an existing file.

3. Decide a sensible, minimal set of NEW subagent roles that match what is ACTUALLY present in this repo. Do not invent roles for stacks that don't exist here — e.g. don't create a mobile agent if there is no mobile app directory, don't create a marketing agent unless there is a clear marketing/content surface in the repo. Roles to consider, only where genuinely relevant: backend/API developer (split into a junior implementer and a senior/architect reviewer only if the codebase is large enough to justify that split), frontend/web UI developer, mobile UI developer, DevOps/infra, QA/test automation, docs/technical writer, marketing/content (only if there's an actual marketing site or content directory). Use judgement: a small single-service repo might only warrant one or two agents; a large multi-module monorepo might warrant five or more.

4. For each new role, write a \`.claude/agents/<kebab-case-name>.md\` file with:
   - YAML frontmatter: \`name\`, \`description\` (specific and triggerable — when should this agent be used), \`model\` (\`claude-sonnet-4-6\` for most roles; \`claude-opus-4-8\` only for roles that need the deepest reasoning, such as a senior/architect role), \`color\`, and \`department\` (a short label like "Backend", "Mobile", "QA" — used purely for grouping in the AgentStack UI, harmless to other tools).
   - A thorough system-prompt body: the agent's concrete responsibilities, the actual tech stack/conventions you found in step 1, the directories/files it owns, and any real constraints you noticed (e.g. "never touch module X directly, go through Y"). Write it with the same care and specificity as a senior engineer's onboarding doc for that exact role on this exact codebase — no filler, no generic boilerplate.

5. When finished, print a short markdown summary list of the agent files you created (name + one-line role), and note any obviously-needed role you skipped because it already exists.

Do not create placeholder or generic agents. Every agent must reflect what you actually found in this specific codebase.`

/**
 * Runs a one-off, non-persisted Agent SDK session whose job is to scan the
 * project and write new .claude/agents/*.md files. Progress streams to the
 * renderer on 'generate:event'; 'generate:done' fires once the run ends
 * (success or failure) so the UI can stop showing a spinner and refresh the
 * agent roster.
 */
export function generateAgents(projectId: string, projectPath: string, win: BrowserWindow): void {
  const key = `generate::${projectId}`

  const handle = query({
    prompt:
      'Analyze this project and generate the appropriate Claude Code subagents, following your instructions exactly.',
    options: {
      cwd: projectPath,
      systemPrompt: GENERATOR_SYSTEM_PROMPT,
      model: 'claude-opus-4-8',
      permissionMode: 'default',
      canUseTool: async () => ({ behavior: 'allow' })
    }
  })

  void (async () => {
    try {
      for await (const message of handle) {
        forwardQuota(win, message)
        if (win.isDestroyed()) continue
        win.webContents.send('generate:event', { key, message })
      }
    } catch (err) {
      if (!win.isDestroyed()) {
        win.webContents.send('generate:event', {
          key,
          message: { type: 'local_error', error: err instanceof Error ? err.message : String(err) }
        })
      }
    } finally {
      handle.close()
      if (!win.isDestroyed()) win.webContents.send('generate:done', { key })
    }
  })()
}
