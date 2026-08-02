import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import type { AgentInfo, NewAgentInput } from '../shared/types'

const FALLBACK_ICONS: Record<string, string> = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
  green: '🟢',
  blue: '🔵',
  purple: '🟣'
}

function agentsDirFor(projectPath: string): string {
  return join(projectPath, '.claude', 'agents')
}

export async function listAgents(projectPath: string): Promise<AgentInfo[]> {
  const agentsDir = agentsDirFor(projectPath)
  if (!existsSync(agentsDir)) return []

  const entries = await readdir(agentsDir, { withFileTypes: true })
  const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md'))

  const agents: AgentInfo[] = []
  for (const file of mdFiles) {
    const filePath = join(agentsDir, file.name)
    try {
      const raw = await readFile(filePath, 'utf-8')
      const { data } = matter(raw)
      if (!data.name || typeof data.name !== 'string') continue

      agents.push({
        name: data.name,
        description: typeof data.description === 'string' ? data.description : undefined,
        model: typeof data.model === 'string' ? data.model : undefined,
        color: typeof data.color === 'string' ? data.color : undefined,
        icon:
          typeof data.icon === 'string'
            ? data.icon
            : (FALLBACK_ICONS[data.color as string] ?? data.name[0]?.toUpperCase()),
        // AgentStack-only, additive field for grouping desks on the floor —
        // ignored by Claude Code itself, same convention as `icon`.
        department: typeof data.department === 'string' ? data.department : undefined,
        filePath
      })
    } catch {
      // Skip unparsable agent files rather than failing the whole roster.
    }
  }
  return agents
}

/**
 * Reads the system prompt (markdown body) and optional tool restriction for
 * one agent by frontmatter name. `Options.agent` does not reliably switch
 * the main thread's persona (confirmed against a real project), so sessions
 * apply this directly via `Options.systemPrompt` instead.
 */
export async function readAgentPrompt(
  projectPath: string,
  agentName: string
): Promise<{ systemPrompt: string; tools?: string[] } | undefined> {
  const agents = await listAgents(projectPath)
  const agent = agents.find((a) => a.name === agentName)
  if (!agent) return undefined

  const raw = await readFile(agent.filePath, 'utf-8')
  const { data, content } = matter(raw)
  const tools = Array.isArray(data.tools) && data.tools.every((t) => typeof t === 'string')
    ? (data.tools as string[])
    : undefined

  return { systemPrompt: content.trim(), tools }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent'
  )
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export async function createAgent(projectPath: string, input: NewAgentInput): Promise<AgentInfo> {
  const agentsDir = agentsDirFor(projectPath)
  await mkdir(agentsDir, { recursive: true })

  const slug = slugify(input.name)
  let filePath = join(agentsDir, `${slug}.md`)
  let suffix = 2
  while (existsSync(filePath)) {
    filePath = join(agentsDir, `${slug}-${suffix}.md`)
    suffix += 1
  }

  const frontmatterLines = [
    '---',
    `name: ${yamlString(input.name)}`,
    `description: ${yamlString(input.description)}`,
    `model: ${yamlString(input.model)}`,
    `color: ${yamlString(input.color)}`
  ]
  if (input.icon) frontmatterLines.push(`icon: ${yamlString(input.icon)}`)
  if (input.department) frontmatterLines.push(`department: ${yamlString(input.department)}`)
  frontmatterLines.push('---', '')

  const file = frontmatterLines.join('\n') + input.systemPrompt.trim() + '\n'
  await writeFile(filePath, file, 'utf-8')

  return {
    name: input.name,
    description: input.description,
    model: input.model,
    color: input.color,
    icon: input.icon ?? FALLBACK_ICONS[input.color] ?? input.name[0]?.toUpperCase(),
    department: input.department,
    filePath
  }
}

export async function updateAgent(
  filePath: string,
  input: NewAgentInput
): Promise<AgentInfo> {
  const frontmatterLines = [
    '---',
    `name: ${yamlString(input.name)}`,
    `description: ${yamlString(input.description)}`,
    `model: ${yamlString(input.model)}`,
    `color: ${yamlString(input.color)}`
  ]
  if (input.icon) frontmatterLines.push(`icon: ${yamlString(input.icon)}`)
  if (input.department) frontmatterLines.push(`department: ${yamlString(input.department)}`)
  frontmatterLines.push('---', '')

  const file = frontmatterLines.join('\n') + input.systemPrompt.trim() + '\n'
  await writeFile(filePath, file, 'utf-8')

  return {
    name: input.name,
    description: input.description,
    model: input.model,
    color: input.color,
    icon: input.icon ?? FALLBACK_ICONS[input.color] ?? input.name[0]?.toUpperCase(),
    department: input.department,
    filePath
  }
}
