import { EventEmitter } from 'node:events'
import type { OrchestrationEvent, PermissionRequest, QuotaInfo, SessionEvent } from '../../shared/types'

/**
 * Every cross-cutting notification the main process needs to hand to the renderer,
 * keyed by its eventual IPC channel name. Domain services (sessions, orchestration,
 * quota, permissions) only know about this bus — never about `BrowserWindow` or
 * `webContents.send` directly. `index.ts` is the single subscriber that bridges
 * bus events onto the live window, so swapping the transport (or adding a second
 * window) never touches domain code.
 */
export type AppEvents = {
  'session:event': SessionEvent
  'orchestration:event': OrchestrationEvent
  'quota:update': QuotaInfo
  'session:permission_request': PermissionRequest
}

class AppEventBus {
  private readonly emitter = new EventEmitter()

  constructor() {
    // Many sessions/agents can be live at once, each wired to this bus.
    this.emitter.setMaxListeners(50)
  }

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    this.emitter.emit(event, payload)
  }

  on<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): () => void {
    this.emitter.on(event, listener)
    return () => this.emitter.off(event, listener)
  }
}

/** Process-wide singleton — every module imports this same instance. */
export const appEvents = new AppEventBus()
