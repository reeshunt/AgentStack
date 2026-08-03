import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MockupScreen } from '../shared/types'

const EXT_FOR_LANG: Record<MockupScreen['lang'], string> = {
  html: 'html',
  jsx: 'jsx',
  tsx: 'tsx',
  react: 'jsx'
}
const LANG_FOR_EXT: Record<string, MockupScreen['lang']> = { html: 'html', jsx: 'jsx', tsx: 'tsx' }

const TITLE_COMMENT_RE = /^(?:<!--\s*title:\s*(.*?)\s*-->|\/\/\s*title:\s*(.*?))\s*\n/

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'screen'
  )
}

function mockupsDirFor(projectPath: string, agentName: string): string {
  return join(projectPath, '.claude', 'mockups', slugify(agentName))
}

function titleComment(title: string, lang: MockupScreen['lang']): string {
  return lang === 'html' ? `<!-- title: ${title} -->\n` : `// title: ${title}\n`
}

/** Persists (or overwrites, if a screen with the same title already exists) one mockup screen
 *  as a real file under the project's .claude/mockups/<agent>/ directory. */
export async function saveMockup(
  projectPath: string,
  agentName: string,
  screen: { title: string; lang: MockupScreen['lang']; code: string }
): Promise<MockupScreen> {
  const dir = mockupsDirFor(projectPath, agentName)
  await mkdir(dir, { recursive: true })

  const id = slugify(screen.title)
  const ext = EXT_FOR_LANG[screen.lang]
  const filePath = join(dir, `${id}.${ext}`)
  const file = titleComment(screen.title, screen.lang) + screen.code.trim() + '\n'
  await writeFile(filePath, file, 'utf-8')

  return { id, title: screen.title, lang: screen.lang, code: screen.code.trim() }
}

export async function listMockups(projectPath: string, agentName: string): Promise<MockupScreen[]> {
  const dir = mockupsDirFor(projectPath, agentName)
  if (!existsSync(dir)) return []

  const entries = await readdir(dir, { withFileTypes: true })
  const screens: MockupScreen[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
    const lang = LANG_FOR_EXT[ext]
    if (!lang) continue

    const filePath = join(dir, entry.name)
    try {
      const raw = await readFile(filePath, 'utf-8')
      const match = raw.match(TITLE_COMMENT_RE)
      const title = match ? (match[1] ?? match[2] ?? '').trim() : entry.name.replace(/\.[^.]+$/, '')
      const code = match ? raw.slice(match[0].length).trim() : raw.trim()
      const id = entry.name.replace(/\.[^.]+$/, '')
      screens.push({ id, title: title || id, lang, code })
    } catch {
      // Skip unreadable files rather than failing the whole list.
    }
  }

  return screens
}

export async function deleteMockup(
  projectPath: string,
  agentName: string,
  screenId: string
): Promise<void> {
  const dir = mockupsDirFor(projectPath, agentName)
  for (const ext of ['html', 'jsx', 'tsx']) {
    const filePath = join(dir, `${screenId}.${ext}`)
    if (existsSync(filePath)) {
      await unlink(filePath)
      return
    }
  }
}
