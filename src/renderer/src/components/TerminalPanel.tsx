import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

type Props = {
  projectId: string
  projectPath: string
  collapsed: boolean
  onToggleCollapsed: () => void
}

/** Approximate hex values for xterm's own theme option (it can't consume the
 *  app's oklch CSS custom properties directly). Kept close to the warm dark
 *  amber palette used everywhere else. */
const TERMINAL_THEME = {
  background: '#1c1a16',
  foreground: '#e9e3da',
  cursor: '#e0a95c',
  selectionBackground: '#e0a95c55',
  black: '#1c1a16',
  brightBlack: '#5c574d'
}

export default function TerminalPanel({
  projectId,
  projectPath,
  collapsed,
  onToggleCollapsed
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  // One xterm instance + one backing shell per project. Recreated only when
  // the project changes — collapsing the panel just hides it via CSS so the
  // running shell and its scrollback survive minimize/expand.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      convertEol: true,
      fontSize: 12,
      fontFamily: "'IBM Plex Mono', 'Monaco', 'SF Mono', monospace",
      theme: TERMINAL_THEME,
      cursorBlink: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    void window.agentstack.startTerminal(projectId, projectPath, term.cols, term.rows)

    const offData = window.agentstack.onTerminalData(({ projectId: pid, data }) => {
      if (pid === projectId) term.write(data)
    })
    const offExit = window.agentstack.onTerminalExit(({ projectId: pid }) => {
      if (pid === projectId) term.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n')
    })
    const inputDisposable = term.onData((data) => {
      window.agentstack.writeTerminal(projectId, data)
    })

    return () => {
      offData()
      offExit()
      inputDisposable.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [projectId, projectPath])

  // Re-fit whenever the container's actual box size changes — window
  // resizes, sidebar toggles, and (crucially) the panel's own expand/collapse
  // CSS transition, which changes height gradually over ~150ms. A one-shot
  // fit() right after toggling `collapsed` would measure the box mid-transition
  // (often just a few pixels tall) and lock the terminal to ~1 visible row;
  // ResizeObserver keeps firing as the box grows and settles on the real size.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      if (collapsed) return
      const term = termRef.current
      const fit = fitRef.current
      if (!term || !fit) return
      fit.fit()
      window.agentstack.resizeTerminal(projectId, term.cols, term.rows)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [collapsed, projectId])

  return (
    <div className={`terminal-panel ${collapsed ? 'terminal-panel-collapsed' : ''}`}>
      <div className="terminal-panel-header">
        <button
          className="terminal-toggle"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand terminal' : 'Minimize terminal'}
        >
          {collapsed ? '▲' : '▼'} Terminal
        </button>
      </div>
      <div className="terminal-body" ref={containerRef} />
    </div>
  )
}
