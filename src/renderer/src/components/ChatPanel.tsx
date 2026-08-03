import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import type { AgentInfo, PermissionMode } from '../../../shared/types'
import type { ChatItem } from '../chatItems'
import ChatRow from './ChatRow'
import PreviewPanel from './PreviewPanel'
import { getSpeechRecognitionCtor, type SpeechRecognitionInstance } from '../speechRecognition'

const STATUS_TEXT: Record<string, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  running: 'Running',
  needs_input: 'Needs Input',
  error: 'Error',
  done: 'Done'
}

type Props = {
  agent: AgentInfo
  items: ChatItem[]
  status: string
  onSend: (text: string) => void
  permissionMode: PermissionMode
  onChangePermissionMode: (mode: PermissionMode) => void
  agents: AgentInfo[]
  onHandoff: (targetAgentName: string, promptText: string) => void
  projectPath: string
  onClearSession: () => void
}

export default function ChatPanel({
  agent,
  items,
  status,
  onSend,
  permissionMode,
  onChangePermissionMode,
  agents,
  onHandoff,
  projectPath,
  onClearSession
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [focusMode, setFocusMode] = useState(
    () => localStorage.getItem(`calm:${agent.name}`) === '1'
  )
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const speechSupported = Boolean(getSpeechRecognitionCtor())

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    setFocusMode(localStorage.getItem(`calm:${agent.name}`) === '1')
  }, [agent.name])

  function toggleFocusMode(): void {
    setFocusMode((prev) => {
      const next = !prev
      localStorage.setItem(`calm:${agent.name}`, next ? '1' : '0')
      return next
    })
  }

  const submit = (): void => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function toggleListening(): void {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const recognition = new Ctor()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim()
      if (!transcript) return
      setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  return (
    <div className={`agent-chat-panel ${agent.previewUI ? 'has-preview' : ''}`}>
      <div className="agent-chat-column">
      <div className="chat-header">
        <div className="character" style={{ animation: 'none', marginTop: 0 }}>
          <div className="character-head" />
          <div className="character-collar" />
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{agent.name}</div>
          <div className="chat-header-role">
            {agent.description ?? 'Subagent'} · {agent.model ?? 'default model'}
          </div>
        </div>
        <button
          className="chat-clear-session"
          title="Clear session — forgets this conversation and resumes fresh from the agent's original role, with no memory of anything said before"
          onClick={() => {
            if (confirm(`Clear this conversation with ${agent.name}? This can't be undone.`)) {
              onClearSession()
            }
          }}
          type="button"
        >
          ↺ Clear session
        </button>
      </div>

      <div className="chat-status-row">
        <span className={`agent-status-dot ${status}`} />
        {STATUS_TEXT[status] ?? status}
        <select
          className="permission-mode-select"
          value={permissionMode}
          onChange={(e) => onChangePermissionMode(e.target.value as PermissionMode)}
        >
          <option value="confirm">Ask Me</option>
          <option value="auto">Auto Accept</option>
        </select>
        <button
          className={`calm-toggle ${focusMode ? 'calm-toggle-active' : ''}`}
          onClick={toggleFocusMode}
          title={
            focusMode
              ? 'Focus mode on — showing text only'
              : 'Focus mode off — showing everything'
          }
          type="button"
        >
          {focusMode ? '🌙 Focus mode' : '🔔 Focus mode'}
        </button>
        <span
          className="focus-mode-info"
          title="Focus mode hides tool calls, file diffs, and other non-text activity so the chat only shows the conversation itself — useful when you just want to read the agent's reasoning without the noise."
        >
          ⓘ
        </span>
      </div>

      <div className="chat-thread">
        {items.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <div>Send a message to start working with {agent.name}.</div>
          </div>
        )}
        {items.map((item) => (
          <ChatRow key={item.id} item={item} calm={focusMode} />
        ))}
      </div>

      <div className="chat-input-row">
        {speechSupported && (
          <button
            className={`chat-mic ${listening ? 'chat-mic-active' : ''}`}
            onClick={toggleListening}
            title={listening ? 'Stop listening' : 'Speak your message'}
            type="button"
          >
            {listening ? '⏺' : '🎤'}
          </button>
        )}
        <input
          className="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={listening ? 'Listening…' : `Message ${agent.name}...`}
        />
        <button className="chat-send" onClick={submit} disabled={!draft.trim()}>
          →
        </button>
      </div>
      </div>

      {agent.previewUI && (
        <PreviewPanel
          items={items}
          agents={agents}
          currentAgentName={agent.name}
          onHandoff={onHandoff}
          onSend={onSend}
          projectPath={projectPath}
        />
      )}
    </div>
  )
}
