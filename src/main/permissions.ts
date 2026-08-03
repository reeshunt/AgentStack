import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { appEvents } from './events/AppEventBus'
import { getPermissionMode } from './settings'

type Pending = { resolve: (result: PermissionResult) => void }

const pending = new Map<string, Pending>()

/**
 * Pauses a tool call for user approval when the project is in confirm mode.
 * Resolves immediately in auto-accept mode. `toolUseID` is unique per tool
 * call (per the SDK's canUseTool contract) and is the key used to match the
 * renderer's later response back to this specific pending call.
 */
export function requestPermission(
  sessionKeyStr: string,
  projectId: string,
  toolName: string,
  toolInput: unknown,
  toolUseID: string,
  signal: AbortSignal
): Promise<PermissionResult> {
  if (getPermissionMode(projectId) === 'auto') {
    return Promise.resolve({ behavior: 'allow' })
  }

  return new Promise<PermissionResult>((resolve) => {
    pending.set(toolUseID, { resolve })

    const cleanup = (): void => {
      pending.delete(toolUseID)
    }

    signal.addEventListener(
      'abort',
      () => {
        if (!pending.has(toolUseID)) return
        cleanup()
        resolve({ behavior: 'deny', message: 'Cancelled', interrupt: true })
      },
      { once: true }
    )

    appEvents.emit('session:permission_request', {
      key: sessionKeyStr,
      toolUseID,
      toolName,
      toolInput
    })

    // Wrap resolve so answering also clears the pending entry.
    pending.set(toolUseID, {
      resolve: (result) => {
        cleanup()
        resolve(result)
      }
    })
  })
}

export function answerPermission(
  toolUseID: string,
  approved: boolean,
  reason?: string,
  updatedInput?: Record<string, unknown>
): void {
  const entry = pending.get(toolUseID)
  if (!entry) return
  entry.resolve(
    approved
      ? { behavior: 'allow', updatedInput }
      : { behavior: 'deny', message: reason || 'Denied by user' }
  )
}
