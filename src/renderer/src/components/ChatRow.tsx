import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatItem } from '../chatItems'

export default function ChatRow({ item }: { item: ChatItem }): React.JSX.Element {
  if (item.kind === 'user') {
    return <div className="chat-msg-user">{item.text}</div>
  }
  if (item.kind === 'assistant-text') {
    return (
      <div className="chat-msg-agent markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
      </div>
    )
  }
  if (item.kind === 'tool') {
    return (
      <div className="chat-msg-agent chat-msg-tool">
        <div className="tool-title">🔧 {item.name}</div>
        <pre className="tool-input">{JSON.stringify(item.input, null, 2)}</pre>
      </div>
    )
  }
  if (item.kind === 'permission') {
    return (
      <div className={`chat-msg-agent chat-msg-permission chat-msg-permission-${item.status}`}>
        <div className="tool-title">🔒 Wants to run: {item.toolName}</div>
        <pre className="tool-input">{JSON.stringify(item.input, null, 2)}</pre>
        {item.status === 'pending' ? (
          <div className="permission-actions">
            <button className="dialog-button" onClick={() => item.onDecide(false)}>
              Deny
            </button>
            <button className="dialog-button primary" onClick={() => item.onDecide(true)}>
              Approve
            </button>
          </div>
        ) : (
          <div className="permission-decided">
            {item.status === 'approved' ? '✓ Approved' : '✗ Denied'}
          </div>
        )}
      </div>
    )
  }
  return <div className="chat-msg-agent chat-msg-error">⚠ {item.text}</div>
}
