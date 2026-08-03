import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentInfo, MockupScreen } from '../../../shared/types'
import type { ChatItem } from '../chatItems'
import { extractPreviewScreens, slugifyTitle, wrapForPreview } from '../previewScreens'

type Tab = 'mockups' | 'wireframes'

type Annotation = {
  id: string
  x: number
  y: number
  elementLabel: string
  note: string
}

type Props = {
  items: ChatItem[]
  agents: AgentInfo[]
  currentAgentName: string
  onHandoff: (targetAgentName: string, promptText: string) => void
  onSend: (text: string) => void
  projectPath: string
}

const EXT_FOR_LANG: Record<MockupScreen['lang'], string> = {
  html: 'html',
  jsx: 'jsx',
  tsx: 'tsx',
  react: 'jsx'
}

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2
const ZOOM_STEP = 0.25

function exportScreen(screen: MockupScreen): void {
  const blob = new Blob([screen.code], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${screen.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'screen'}.${EXT_FOR_LANG[screen.lang]}`
  a.click()
  URL.revokeObjectURL(url)
}

/** Builds a short, human-readable description of a clicked element for the feedback prompt. */
function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const cls =
    typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : ''
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const label = `<${tag}${id}${cls}>`
  return text ? `${label} ("${text}${text.length === 40 ? '…' : ''}")` : label
}

/**
 * Finds which other screen a clicked wireframe element should navigate to, so the
 * Wireframes tab behaves like a click-through prototype rather than a static image.
 * Prefers an explicit `data-goto="Screen Title"` attribute (the reliable convention —
 * worth adding to the agent's prompt); falls back to fuzzy-matching the clicked
 * element's own text against other screens' titles.
 */
function findNavigationTarget(el: Element, screens: MockupScreen[], excludeId: string): MockupScreen | null {
  const explicitHost = el.closest('[data-goto]')
  if (explicitHost) {
    const label = explicitHost.getAttribute('data-goto')?.toLowerCase().trim() ?? ''
    const exact = screens.find((s) => s.id !== excludeId && s.title.toLowerCase() === label)
    if (exact) return exact
    const bySlug = screens.find((s) => s.id === slugifyTitle(label))
    if (bySlug) return bySlug
  }

  const clickable = el.closest('button, a, [role="button"], [onclick]') ?? el
  const text = (clickable.textContent ?? '').trim().toLowerCase()
  if (!text) return null

  let best: MockupScreen | null = null
  let bestScore = 0
  for (const screen of screens) {
    if (screen.id === excludeId) continue
    const title = screen.title.toLowerCase()
    let score = 0
    if (title.includes(text) || text.includes(title)) {
      score = Math.max(title.length, text.length)
    } else {
      score = title.split(/\s+/).filter((word) => word.length > 2 && text.includes(word)).length
    }
    if (score > bestScore) {
      bestScore = score
      best = screen
    }
  }
  return bestScore > 0 ? best : null
}

function dismissedKey(projectPath: string, agentName: string): string {
  return `mockup-dismissed:${projectPath}:${agentName}`
}

function loadDismissed(projectPath: string, agentName: string): Set<string> {
  try {
    const raw = localStorage.getItem(dismissedKey(projectPath, agentName))
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveDismissed(projectPath: string, agentName: string, ids: Set<string>): void {
  localStorage.setItem(dismissedKey(projectPath, agentName), JSON.stringify([...ids]))
}

export default function PreviewPanel({
  items,
  agents,
  currentAgentName,
  onHandoff,
  onSend,
  projectPath
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('mockups')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [handoffTarget, setHandoffTarget] = useState('')
  const [annotating, setAnnotating] = useState(false)
  const [annotationsByScreen, setAnnotationsByScreen] = useState<Record<string, Annotation[]>>({})
  const [savedScreens, setSavedScreens] = useState<MockupScreen[]>([])
  const [zoom, setZoom] = useState(1)
  const [iframeDoc, setIframeDoc] = useState<Document | null>(null)
  const dismissedRef = useRef<Set<string>>(loadDismissed(projectPath, currentAgentName))
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const seqRef = useRef(0)

  // Reload persisted mockups (real files under .claude/mockups/<agent>/) whenever
  // the project or agent changes, so screens are available from any clone of the repo.
  useEffect(() => {
    dismissedRef.current = loadDismissed(projectPath, currentAgentName)
    let cancelled = false
    window.agentstack.listMockups(projectPath, currentAgentName).then((screens) => {
      if (!cancelled) setSavedScreens(screens)
    })
    return () => {
      cancelled = true
    }
  }, [projectPath, currentAgentName])

  const candidates = useMemo(() => extractPreviewScreens(items), [items])

  // Persist newly-seen chat candidates to disk (skipping any the user has explicitly
  // deleted), and keep the saved list in sync with the latest version of each screen.
  useEffect(() => {
    for (const candidate of candidates) {
      const id = slugifyTitle(candidate.title)
      if (dismissedRef.current.has(id)) continue
      const existing = savedScreens.find((s) => s.id === id)
      if (existing && existing.code === candidate.code) continue

      window.agentstack
        .saveMockup(projectPath, currentAgentName, {
          title: candidate.title,
          lang: candidate.lang,
          code: candidate.code
        })
        .then((saved) => {
          setSavedScreens((prev) => [...prev.filter((s) => s.id !== saved.id), saved])
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, projectPath, currentAgentName])

  const screens = savedScreens
  const active = screens.find((s) => s.id === activeId) ?? screens[0] ?? null
  const annotations = active ? (annotationsByScreen[active.id] ?? []) : []
  const isMockupsTab = tab === 'mockups'

  const handoffCandidates = agents.filter((a) => a.name !== currentAgentName)

  // Reset per-frame UI state whenever the screen or tab changes, since pins, zoom,
  // and annotate mode are all specific to one specific rendered frame.
  useEffect(() => {
    setAnnotating(false)
    setZoom(1)
    setIframeDoc(null)
  }, [active?.id, tab])

  function frameSrcDoc(screen: MockupScreen): string {
    const doc = wrapForPreview(screen)
    if (tab === 'wireframes') {
      const wireframeStyle =
        '<style>*{filter:grayscale(1) contrast(0.85) !important;} body{outline:1px dashed #888;}</style>'
      return doc.includes('</head>')
        ? doc.replace('</head>', `${wireframeStyle}</head>`)
        : wireframeStyle + doc
    }
    return doc
  }

  function onFrameLoad(): void {
    const doc = iframeRef.current?.contentDocument ?? null
    setIframeDoc(doc)
    if (!doc || !active) return

    if (isMockupsTab) {
      // Annotate mode: capture a pin per click, positioned in the iframe's own
      // document coordinates (pageX/pageY) so it's rendered as part of that
      // document via a portal and scrolls/zooms with the content natively.
      const onClick = (e: MouseEvent): void => {
        e.preventDefault()
        e.stopPropagation()
        const target = e.target as Element | null
        if (!target) return

        seqRef.current += 1
        const annotation: Annotation = {
          id: `ann-${seqRef.current}`,
          x: e.pageX,
          y: e.pageY,
          elementLabel: describeElement(target),
          note: ''
        }
        setAnnotationsByScreen((prev) => ({
          ...prev,
          [active.id]: [...(prev[active.id] ?? []), annotation]
        }))
      }
      doc.addEventListener('click', onClick, true)
    } else {
      // Wireframes tab: read-only click-through prototype — tapping a button/link
      // jumps to whichever other screen it appears to point at, instead of annotating.
      const onClick = (e: MouseEvent): void => {
        const target = e.target as Element | null
        if (!target) return
        if (target.closest('a')) e.preventDefault()

        const dest = findNavigationTarget(target, screens, active.id)
        if (dest) {
          e.preventDefault()
          e.stopPropagation()
          setActiveId(dest.id)
        }
      }
      doc.addEventListener('click', onClick, true)
    }
  }

  function updateNote(id: string, note: string): void {
    if (!active) return
    setAnnotationsByScreen((prev) => ({
      ...prev,
      [active.id]: (prev[active.id] ?? []).map((a) => (a.id === id ? { ...a, note } : a))
    }))
  }

  function removeAnnotation(id: string): void {
    if (!active) return
    setAnnotationsByScreen((prev) => ({
      ...prev,
      [active.id]: (prev[active.id] ?? []).filter((a) => a.id !== id)
    }))
  }

  function sendFeedback(): void {
    if (!active || annotations.length === 0) return
    const lines = annotations.map((a, i) => {
      const note = a.note.trim() || '(no note — use your judgement)'
      return `${i + 1}. ${a.elementLabel} — ${note}`
    })
    const prompt = `Revise the "${active.title}" mockup with this feedback on specific elements, then repost the full updated screen as a fenced ${active.lang} code block:\n\n${lines.join('\n')}`
    onSend(prompt)
    setAnnotationsByScreen((prev) => ({ ...prev, [active.id]: [] }))
    setAnnotating(false)
  }

  function sendToAgent(): void {
    if (!active || !handoffTarget) return
    const prompt = `Build out this ${active.lang.toUpperCase()} mockup screen ("${active.title}") for real — wire it up, make it functional, and match the rest of the app's conventions:\n\n\`\`\`${active.lang}\n${active.code}\n\`\`\``
    onHandoff(handoffTarget, prompt)
    setHandoffTarget('')
  }

  function deleteScreen(screen: MockupScreen): void {
    if (!confirm(`Delete "${screen.title}"? This removes its saved file from the project too.`)) return

    window.agentstack.deleteMockup(projectPath, currentAgentName, screen.id)
    dismissedRef.current.add(screen.id)
    saveDismissed(projectPath, currentAgentName, dismissedRef.current)
    setSavedScreens((prev) => prev.filter((s) => s.id !== screen.id))
    setAnnotationsByScreen((prev) => {
      const { [screen.id]: _drop, ...rest } = prev
      return rest
    })
    if (activeId === screen.id) setActiveId(null)
  }

  function zoomBy(delta: number): void {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))))
  }

  return (
    <div className="preview-panel">
      <div className="preview-panel-tabs">
        <button
          className={`preview-tab ${tab === 'mockups' ? 'active' : ''}`}
          onClick={() => setTab('mockups')}
        >
          Mockups
        </button>
        <button
          className={`preview-tab ${tab === 'wireframes' ? 'active' : ''}`}
          onClick={() => setTab('wireframes')}
        >
          Wireframes
        </button>
      </div>

      {screens.length === 0 ? (
        <div className="preview-empty">
          No screens yet. Ask the agent for an HTML/React mockup and it'll show up here — saved to{' '}
          <code>.claude/mockups/</code> in this project.
        </div>
      ) : (
        <>
          <div className={`preview-screens-strip ${tab === 'wireframes' ? 'compact' : ''}`}>
            {screens.map((screen) => (
              <div
                key={screen.id}
                className={`preview-screen-thumb ${tab === 'wireframes' ? 'compact' : ''} ${active?.id === screen.id ? 'active' : ''}`}
                onClick={() => setActiveId(screen.id)}
                title={screen.title}
              >
                <div
                  className={`preview-thumb-frame ${tab === 'wireframes' ? 'wireframe compact' : ''}`}
                >
                  <iframe title={screen.title} srcDoc={frameSrcDoc(screen)} sandbox="allow-scripts" />
                </div>
                <div className="preview-thumb-label-row">
                  <div className="preview-thumb-label">{screen.title}</div>
                  <button
                    className="preview-thumb-delete"
                    title="Delete this mockup"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteScreen(screen)
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {active && (
            <div className="preview-detail">
              <div className="preview-detail-header">
                <span className="preview-detail-title">{active.title}</span>
                <span className="preview-detail-lang">{active.lang}</span>
                {isMockupsTab && (
                  <button
                    className={`dialog-button ${annotating ? 'primary' : ''}`}
                    onClick={() => setAnnotating((v) => !v)}
                  >
                    {annotating ? '✓ Annotating' : '✎ Annotate'}
                  </button>
                )}
                <button className="dialog-button" onClick={() => exportScreen(active)}>
                  Export
                </button>
                <button className="dialog-button preview-delete-button" onClick={() => deleteScreen(active)}>
                  Delete
                </button>
              </div>

              {isMockupsTab && annotating && (
                <div className="preview-annotate-hint">
                  Click any element in the preview below to drop a numbered pin, then add a note for it.
                </div>
              )}
              {!isMockupsTab && (
                <div className="preview-annotate-hint">
                  Click-through preview: tap a button/link to jump to the screen it links to. Add{' '}
                  <code>data-goto="Screen Title"</code> in the mockup for reliable navigation.
                </div>
              )}

              <div className="preview-zoom-controls">
                <button onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} title="Zoom out">
                  −
                </button>
                <span className="preview-zoom-level">{Math.round(zoom * 100)}%</span>
                <button onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} title="Zoom in">
                  +
                </button>
                <button onClick={() => setZoom(1)} disabled={zoom === 1} title="Reset zoom">
                  Reset
                </button>
              </div>

              <div className={`preview-frame-wrap ${annotating && isMockupsTab ? 'annotating' : ''}`}>
                <div className={`preview-detail-frame ${tab === 'wireframes' ? 'wireframe' : ''}`}>
                  {/* Counter-scaled stage: sized to (100/zoom)% so that scaling it by `zoom`
                      always renders back to exactly fill the frame. Zoomed out, the content
                      shrinks and stays centered/filling the frame instead of leaving blank
                      space in a corner; zoomed in, the stage grows past the frame bounds and
                      the frame's own overflow:auto lets you scroll to pan around it. */}
                  <div
                    className="preview-frame-stage"
                    style={{
                      width: `${100 / zoom}%`,
                      height: `${100 / zoom}%`,
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left'
                    }}
                  >
                    <iframe
                      key={active.id + tab}
                      ref={iframeRef}
                      title={active.title}
                      srcDoc={frameSrcDoc(active)}
                      sandbox="allow-scripts allow-same-origin"
                      onLoad={onFrameLoad}
                    />
                  </div>
                </div>
              </div>

              {isMockupsTab &&
                iframeDoc &&
                createPortal(
                  <>
                    {annotations.map((a, i) => (
                      // Inline styles only: this portal renders into the iframe's own
                      // document, which never loads the app's styles.css.
                      <div
                        key={a.id}
                        title={a.elementLabel}
                        style={{
                          position: 'absolute',
                          left: a.x,
                          top: a.y,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: 'oklch(0.78 0.14 75)',
                          color: 'oklch(0.16 0.02 60)',
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: 'system-ui, sans-serif',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transform: 'translate(-50%, -50%)',
                          boxShadow: '0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,0.35)',
                          pointerEvents: 'none',
                          zIndex: 999999
                        }}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </>,
                  iframeDoc.body
                )}

              {isMockupsTab && annotations.length > 0 && (
                <div className="preview-annotation-queue">
                  {annotations.map((a, i) => (
                    <div key={a.id} className="preview-annotation-row">
                      <span className="preview-annotation-num">{i + 1}</span>
                      <div className="preview-annotation-body">
                        <div className="preview-annotation-el">{a.elementLabel}</div>
                        <input
                          value={a.note}
                          onChange={(e) => updateNote(a.id, e.target.value)}
                          placeholder="What should change here?"
                          autoFocus={i === annotations.length - 1}
                        />
                      </div>
                      <button
                        className="preview-annotation-remove"
                        title="Remove"
                        onClick={() => removeAnnotation(a.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button className="dialog-button primary preview-send-feedback" onClick={sendFeedback}>
                    Send {annotations.length} note{annotations.length === 1 ? '' : 's'} to {currentAgentName}
                  </button>
                </div>
              )}

              {handoffCandidates.length > 0 && (
                <div className="preview-handoff-row">
                  <select
                    value={handoffTarget}
                    onChange={(e) => setHandoffTarget(e.target.value)}
                  >
                    <option value="">Hand off to agent…</option>
                    {handoffCandidates.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="dialog-button primary"
                    disabled={!handoffTarget}
                    onClick={sendToAgent}
                  >
                    Build it
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
