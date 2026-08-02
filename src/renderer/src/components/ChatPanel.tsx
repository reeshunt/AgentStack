import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import type { AgentInfo, PermissionMode } from '../../../shared/types'
import type { ChatItem } from '../chatItems'
import ChatRow from './ChatRow'
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
}

export default function ChatPanel({
  agent,
  items,
  status,
  onSend,
  permissionMode,
  onChangePermissionMode
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [calm, setCalm] = useState(() => localStorage.getItem(`calm:${agent.name}`) === '1')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const speechSupported = Boolean(getSpeechRecognitionCtor())

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    setCalm(localStorage.getItem(`calm:${agent.name}`) === '1')
  }, [agent.name])

  function toggleCalm(): void {
    setCalm((prev) => {
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
    <div className="agent-chat-panel">
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
          className={`calm-toggle ${calm ? 'calm-toggle-active' : ''}`}
          onClick={toggleCalm}
          title={calm ? 'Calm mode on — showing text only' : 'Calm mode off — showing everything'}
          type="button"
        >
          {calm ? '🌙 Calm' : '🔔 Calm'}
        </button>
      </div>

      <div className="chat-thread">
        {items.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <div>Send a message to start working with {agent.name}.</div>
          </div>
        )}
        {items.map((item) => (
          <ChatRow key={item.id} item={item} calm={calm} />
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
  )
}
