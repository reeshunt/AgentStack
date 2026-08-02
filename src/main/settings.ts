import { db } from './db'
import type { PermissionMode } from '../shared/types'

function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

export function getPermissionMode(projectId: string): PermissionMode {
  const value = getSetting(`permission_mode:${projectId}`)
  return value === 'auto' ? 'auto' : 'confirm'
}

export function setPermissionMode(projectId: string, mode: PermissionMode): void {
  setSetting(`permission_mode:${projectId}`, mode)
}
