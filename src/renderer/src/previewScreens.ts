import type { ChatItem } from './chatItems'

export type PreviewLang = 'html' | 'jsx' | 'tsx' | 'react'

export type PreviewScreen = {
  id: string
  title: string
  lang: PreviewLang
  code: string
}

const FENCE_RE = /```(html|jsx|tsx|react)\s*\n([\s\S]*?)```/gi
const HEADING_RE = /^#{1,4}\s+(.+)$/
const FILE_EXT_LANG: Record<string, PreviewLang> = { html: 'html', htm: 'html', jsx: 'jsx', tsx: 'tsx' }

/** Matches the slug the main process derives from a screen's title when persisting it to disk,
 *  so extracted chat candidates can be matched against saved/deleted mockups by stable identity. */
export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'screen'
  )
}

function titleFromPath(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath
  return base.replace(/\.(html?|jsx|tsx)$/i, '')
}

/** Picks up screens the agent saved to disk via a Write tool call instead of
 *  (or in addition to) putting the code in a fenced block in its chat text. */
function screenFromWriteTool(item: ChatItem, index: number): PreviewScreen | null {
  if (item.kind !== 'tool') return null
  if (item.name !== 'Write' && item.name !== 'write_file') return null
  const input = item.input as { file_path?: unknown; path?: unknown; content?: unknown } | null
  if (!input || typeof input !== 'object') return null

  const filePath = typeof input.file_path === 'string' ? input.file_path : input.path
  const content = input.content
  if (typeof filePath !== 'string' || typeof content !== 'string' || !content.trim()) return null

  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const lang = FILE_EXT_LANG[ext]
  if (!lang) return null

  return {
    id: `${item.id}-write-${index}`,
    title: titleFromPath(filePath),
    lang,
    code: content.trim()
  }
}

/** Wraps a bare JSX/TSX snippet in a minimal standalone React document so it can render in an iframe. */
export function wrapForPreview(screen: PreviewScreen): string {
  if (screen.lang === 'html') return screen.code

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>body{margin:0;font-family:system-ui,sans-serif;}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
${screen.code}
const root = ReactDOM.createRoot(document.getElementById('root'));
const Candidate = typeof App !== 'undefined' ? App : (typeof Screen !== 'undefined' ? Screen : null);
if (Candidate) root.render(<Candidate />);
</script>
</body>
</html>`
}

/**
 * Scans an agent's chat transcript for fenced html/jsx/tsx/react code blocks
 * and turns each into a named "screen" for the Preview panel. The nearest
 * preceding markdown heading (if any) in the same message is used as the title.
 */
export function extractPreviewScreens(items: ChatItem[]): PreviewScreen[] {
  const screens: PreviewScreen[] = []
  let n = 0

  for (const [index, item] of items.entries()) {
    const written = screenFromWriteTool(item, index)
    if (written) {
      screens.push(written)
      continue
    }

    if (item.kind !== 'assistant-text') continue
    const text = item.text
    FENCE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = FENCE_RE.exec(text))) {
      const [full, lang, code] = match
      if (!code.trim()) continue
      n += 1

      const before = text.slice(0, match.index)
      const headingLines = before.split('\n').filter((l) => HEADING_RE.test(l.trim()))
      const lastHeading = headingLines[headingLines.length - 1]
      const title = lastHeading ? lastHeading.trim().replace(/^#{1,4}\s+/, '') : `Screen ${n}`

      screens.push({
        id: `${item.id}-${match.index}-${full.length}`,
        title,
        lang: lang.toLowerCase() as PreviewLang,
        code: code.trim()
      })
    }
  }

  return screens
}
