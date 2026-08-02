import type { StreamedMessage } from '../../shared/types'

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant-text'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; input: unknown }
  | { kind: 'error'; id: string; text: string }
  | {
      kind: 'permission'
      id: string
      toolName: string
      input: unknown
      status: 'pending' | 'approved' | 'denied'
      onDecide: (approved: boolean) => void
    }

let seq = 0
function nextId(): string {
  seq += 1
  return `chat-${seq}`
}

/** Flattens one streamed SDK message into zero or more chat-log rows. */
export function toChatItems(event: { message: StreamedMessage }): ChatItem[] {
  const { message } = event

  if (message.type === 'local_error') {
    return [{ kind: 'error', id: nextId(), text: message.error }]
  }

  if (message.type === 'assistant') {
    if (message.error) {
      return [{ kind: 'error', id: nextId(), text: `Assistant error: ${message.error}` }]
    }
    const blocks = message.message.content
    if (!Array.isArray(blocks)) return []

    const items: ChatItem[] = []
    for (const block of blocks) {
      if (block.type === 'text') {
        items.push({ kind: 'assistant-text', id: nextId(), text: block.text })
      } else if (block.type === 'tool_use') {
        items.push({ kind: 'tool', id: nextId(), name: block.name, input: block.input })
      }
    }
    return items
  }

  if (message.type === 'result' && message.is_error) {
    const text = message.subtype === 'success' ? message.result : message.errors.join('; ')
    return [{ kind: 'error', id: nextId(), text: text || 'Turn ended with an error.' }]
  }

  return []
}

export function userChatItem(text: string): ChatItem {
  return { kind: 'user', id: nextId(), text }
}
