import * as pty from 'node-pty'
import type { BrowserWindow } from 'electron'

type TerminalState = {
  projectId: string
  proc: pty.IPty
}

const terminals = new Map<string, TerminalState>()

function shellCommand(): string {
  return process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL ?? '/bin/zsh')
}

/** Starts (or reuses) a persistent shell for one project's directory — the
 *  session stays alive across panel collapse/expand, same as a real terminal
 *  tab, so scrollback and any running command survive hiding the panel. */
export function ensureTerminal(
  projectId: string,
  projectPath: string,
  cols: number,
  rows: number,
  win: BrowserWindow
): { started: boolean } {
  const existing = terminals.get(projectId)
  if (existing) return { started: false }

  const proc = pty.spawn(shellCommand(), [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: projectPath,
    env: process.env
  })

  terminals.set(projectId, { projectId, proc })

  proc.onData((data) => {
    if (!win.isDestroyed()) win.webContents.send('terminal:data', { projectId, data })
  })
  proc.onExit(() => {
    terminals.delete(projectId)
    if (!win.isDestroyed()) win.webContents.send('terminal:exit', { projectId })
  })

  return { started: true }
}

export function writeTerminal(projectId: string, data: string): void {
  terminals.get(projectId)?.proc.write(data)
}

export function resizeTerminal(projectId: string, cols: number, rows: number): void {
  const state = terminals.get(projectId)
  if (!state) return
  try {
    state.proc.resize(cols, rows)
  } catch {
    // Resizing a just-exited pty can throw — harmless, ignore.
  }
}

export function killTerminal(projectId: string): void {
  const state = terminals.get(projectId)
  if (!state) return
  state.proc.kill()
  terminals.delete(projectId)
}

export function killAllTerminals(): void {
  for (const { proc } of terminals.values()) proc.kill()
  terminals.clear()
}
