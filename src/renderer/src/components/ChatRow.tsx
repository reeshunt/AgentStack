import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentInfo } from '../../../shared/types'
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

/** answers is keyed by question text -> chosen label(s), comma-joined for
 *  multi-select — the shape Claude Code's AskUserQuestion tool reads its
 *  result from (`updatedInput.answers`), same as the built-in permission UI. */
function AskUserQuestionCard({
  input,
  status,
  onDecide
}: {
  input: { questions: AskUserQuestionEntry[] }
  status: 'pending' | 'approved' | 'denied'
  onDecide: (approved: boolean, updatedInput?: Record<string, unknown>) => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<Record<number, string[]>>({})

  function toggleOption(qi: number, label: string, multiSelect: boolean | undefined): void {
    setSelected((prev) => {
      const current = prev[qi] ?? []
      if (multiSelect) {
        const next = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current, label]
        return { ...prev, [qi]: next }
      }
      return { ...prev, [qi]: [label] }
    })
  }

  const allAnswered = input.questions.every((_, qi) => (selected[qi] ?? []).length > 0)

  function approve(): void {
    if (!allAnswered) return
    const answers: Record<string, string> = {}
    input.questions.forEach((q, qi) => {
      answers[q.question] = (selected[qi] ?? []).join(', ')
    })
    onDecide(true, { questions: input.questions, answers })
  }

  return (
    <div className="askq-card">
      {input.questions.map((q, qi) => (
        <div className="askq-question-block" key={qi}>
          <div className="askq-question">{q.question}</div>
          <div className="askq-options">
            {q.options.map((opt, oi) => {
              const isChecked = (selected[qi] ?? []).includes(opt.label)
              return (
                <label
                  className={`askq-option ${isChecked ? 'askq-option-selected' : ''}`}
                  key={oi}
                >
                  <div className="askq-option-row">
                    <input
                      type={q.multiSelect ? 'checkbox' : 'radio'}
                      name={`askq-${qi}`}
                      disabled={status !== 'pending'}
                      checked={isChecked}
                      onChange={() => toggleOption(qi, opt.label, q.multiSelect)}
                    />
                    <div className="askq-option-label">{opt.label}</div>
                  </div>
                  {opt.description && <div className="askq-option-desc">{opt.description}</div>}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {status === 'pending' ? (
        <div className="permission-actions">
          <button className="dialog-button askq-deny" onClick={() => onDecide(false)}>
            Deny
          </button>
          <button className="dialog-button askq-approve" disabled={!allAnswered} onClick={approve}>
            Send answer{input.questions.length === 1 ? '' : 's'}
          </button>
        </div>
      ) : (
        <div className="permission-decided">
          {status === 'approved' ? '✓ Answered' : '✗ Denied'}
        </div>
      )}
    </div>
  )
}

/** Lets the user forward one assistant reply (e.g. a PRD from a docs/planning
 *  agent) to another agent's conversation as its opening prompt, without
 *  manually copy-pasting between chats. */
function HandoffControl({
  text,
  agents,
  currentAgentName,
  onHandoff
}: {
  text: string
  agents: AgentInfo[]
  currentAgentName: string
  onHandoff: (targetAgentName: string, promptText: string) => void
}): React.JSX.Element | null {
  const [target, setTarget] = useState('')
  const candidates = agents.filter((a) => a.name !== currentAgentName)
  if (candidates.length === 0) return null

  function send(): void {
    if (!target) return
    onHandoff(target, `${currentAgentName} shared this — please pick up from here:\n\n${text}`)
    setTarget('')
  }

  return (
    <div className="chat-handoff-row">
      <select value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">Hand off to agent…</option>
        {candidates.map((a) => (
          <option key={a.name} value={a.name}>
            {a.icon ? `${a.icon} ` : ''}
            {a.name}
          </option>
        ))}
      </select>
      <button className="dialog-button primary" disabled={!target} onClick={send}>
        Send
      </button>
    </div>
  )
}

export default function ChatRow({
  item,
  calm = false,
  agents,
  currentAgentName,
  onHandoff
}: {
  item: ChatItem
  calm?: boolean
  agents: AgentInfo[]
  currentAgentName: string
  onHandoff: (targetAgentName: string, promptText: string) => void
}): React.JSX.Element {
  if (item.kind === 'user') {
    return (
      <div className="chat-msg-user">
        {item.source === 'floor-manager' && (
          <div className="chat-msg-from-fm">🗂 From Floor Manager</div>
        )}
        {item.text}
      </div>
    )
  }
  if (item.kind === 'assistant-text') {
    // The Floor Manager already has a real delegation path (`delegate_task`) that hands work
    // to another agent's session and awaits the result — offering this manual "forward my
    // reply" control on top of that would just be a second, weaker way to do the same thing.
    // It stays available on worker agents' chats, which have no delegation tool of their own.
    const isFloorManager = agents.find((a) => a.name === currentAgentName)?.isFloorManager
    return (
      <div className="chat-msg-agent markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
        {!calm && !isFloorManager && (
          <HandoffControl
            text={item.text}
            agents={agents}
            currentAgentName={currentAgentName}
            onHandoff={onHandoff}
          />
        )}
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
  if (item.kind === 'delegation-stats') {
    return (
      <div className="chat-msg-agent chat-msg-stats">
        <div className="tool-title">
          {item.status === 'done' ? '✅' : '⚠️'} {item.agentName}{' '}
          {item.status === 'done' ? 'finished' : 'hit an error'}
        </div>
        <div className="stats-row">
          <span className="stats-label">Context used</span>
          <div className="stats-bar-track">
            <div className="stats-bar-fill" style={{ width: `${item.contextPct}%` }} />
          </div>
          <span className="stats-value">{item.contextPct}%</span>
        </div>
        <div className="stats-row">
          <span className="stats-label">Cost</span>
          <span className="stats-value">${item.costUsd.toFixed(4)}</span>
        </div>
        <div className="stats-row">
          <span className="stats-label">Turns</span>
          <span className="stats-value">{item.numTurns}</span>
        </div>
      </div>
    )
  }
  return <div className="chat-msg-agent chat-msg-error">⚠ {item.text}</div>
}
