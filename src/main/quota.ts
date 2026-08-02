import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { BrowserWindow } from 'electron'

/** Forwards claude.ai subscription rate-limit info to the renderer whenever any active session reports it (opportunistic — no separate polling call exists). */
export function forwardQuota(win: BrowserWindow, message: SDKMessage): void {
  if (message.type !== 'rate_limit_event') return
  if (win.isDestroyed()) return
  win.webContents.send('quota:update', message.rate_limit_info)
}
