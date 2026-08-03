import type { SessionStatus } from '../../shared/types'

/** Single source of truth for status → color/label, shared by desk cards,
 *  the chat status row, and notification badges (previously three separate
 *  hand-picked palettes). */
export const STATUS_COLORS: Record<SessionStatus, string> = {
  idle: 'var(--color-status-idle)',
  thinking: 'var(--color-status-thinking)',
  running: 'var(--color-status-running)',
  needs_input: 'var(--color-status-needs-input)',
  error: 'var(--color-status-error)',
  done: 'var(--color-status-done)'
}

export const STATUS_LABELS: Record<SessionStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking…',
  running: 'Running…',
  needs_input: 'Needs input',
  error: 'Error',
  done: 'Done'
}

/** Statuses that should pulse (actively working / awaiting the user). */
export function statusPulses(status: SessionStatus): boolean {
  return status === 'thinking' || status === 'running' || status === 'needs_input'
}

/** Stable department → accent color, since departments here are free text
 *  rather than the mockup's fixed 4. Hashes the name into a small palette. */
const DEPARTMENT_PALETTE = [
  'var(--color-dept-1)',
  'var(--color-dept-2)',
  'var(--color-dept-3)',
  'var(--color-dept-4)',
  'var(--color-dept-5)',
  'var(--color-dept-6)'
]

export function departmentColor(department: string): string {
  let hash = 0
  for (let i = 0; i < department.length; i++) {
    hash = (hash * 31 + department.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % DEPARTMENT_PALETTE.length
  return DEPARTMENT_PALETTE[index]
}

export const UNASSIGNED_DEPARTMENT = 'General'
