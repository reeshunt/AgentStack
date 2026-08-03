import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { appEvents } from './events/AppEventBus'

/** Forwards claude.ai subscription rate-limit info onto the event bus whenever any active
 *  session reports it (opportunistic — no separate polling call exists). */
export function forwardQuota(message: SDKMessage): void {
  if (message.type !== 'rate_limit_event') return
  appEvents.emit('quota:update', message.rate_limit_info)
}
