import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ClaudeCliStatus } from '../shared/types'

const execFileAsync = promisify(execFile)

/**
 * Pre-flight check only: confirms the `claude` CLI is on PATH so we can show
 * a clear setup screen instead of a cryptic session failure. Login validity
 * itself surfaces later as an `authentication_failed` error on the message
 * stream (see sessions.ts deriveStatus) — the SDK spawns the CLI, which
 * already reuses the `claude login` OAuth session.
 */
export async function checkClaudeCli(): Promise<ClaudeCliStatus> {
  try {
    const { stdout } = await execFileAsync('claude', ['--version'])
    return { available: true, version: stdout.trim() }
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) }
  }
}
