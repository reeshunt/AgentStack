import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatItem } from '../chatItems'

type AskUserQuestionOption = { label: string; description?: string }
type AskUserQuestionEntry = {
  question: string
  header?: string
  options: AskUserQuestionOption[]
  multiSelect?: boolean
}

function isAskUserQuestionInput(
  input: unknown
): input is { questions: AskUserQuestionEntry[] } {
  if (typeof input !== 'object' || input === null) return false
  const questions = (input as { questions?: unknown }).questions
  return Array.isArray(questions)
}

function AskUserQuestionCard({
  input,
  status,
  onDecide
}: {
  input: { questions: AskUserQuestionEntry[] }
  status: 'pending' | 'approved' | 'denied'
  onDecide: (approved: boolean) => void
}): React.JSX.Element {
  return (
    <div className="askq-card">
      {input.questions.map((q, qi) => (
        <div className="askq-question-block" key={qi}>
          <div className="askq-question">{q.question}</div>
          <div className="askq-options">
            {q.options.map((opt, oi) => (
              <div className="askq-option" key={oi}>
                <div className="askq-option-label">{opt.label}</div>
                {opt.description && <div className="askq-option-desc">{opt.description}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {status === 'pending' ? (
        <div className="permission-actions">
          <button className="dialog-button askq-deny" onClick={() => onDecide(false)}>
            Deny
          </button>
          <button className="dialog-button askq-approve" onClick={() => onDecide(true)}>
            Approve
          </button>
        </div>
      ) : (
        <div className="permission-decided">
          {status === 'approved' ? '✓ Approved' : '✗ Denied'}
        </div>
      )}
    </div>
  )
}

export default function ChatRow({
  item,
  calm = false
}: {
  item: ChatItem
  calm?: boolean
}): React.JSX.Element {
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
    if (calm) return <></>
    return (
      <div className="chat-msg-agent chat-msg-tool">
        <div className="tool-title">🔧 {item.name}</div>
        <pre className="tool-input">{JSON.stringify(item.input, null, 2)}</pre>
      </div>
    )
  }
  if (item.kind === 'permission') {
    if (calm && item.status !== 'pending') {
      return (
        <div className="chat-msg-agent chat-msg-permission-compact">
          {item.toolName === 'AskUserQuestion' ? '❓' : '🔒'} {item.toolName}{' '}
          {item.status === 'approved' ? '✓' : '✗'}
        </div>
      )
    }
    if (item.toolName === 'AskUserQuestion' && isAskUserQuestionInput(item.input)) {
      return (
        <div className={`chat-msg-agent chat-msg-permission chat-msg-permission-${item.status}`}>
          <AskUserQuestionCard input={item.input} status={item.status} onDecide={item.onDecide} />
        </div>
      )
    }
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
