import { useState } from 'react'
import type { NewAgentInput } from '../../../shared/types'

const MODEL_OPTIONS = ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5']
const COLOR_OPTIONS = ['blue', 'purple', 'green', 'orange', 'red', 'yellow']

type Props = {
  onCancel: () => void
  onCreate: (input: NewAgentInput) => Promise<void>
}

export default function AddAgentDialog({ onCancel, onCreate }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState(MODEL_OPTIONS[0])
  const [color, setColor] = useState(COLOR_OPTIONS[0])
  const [department, setDepartment] = useState('')
  const [icon, setIcon] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  const canCreate = name.trim() && description.trim() && systemPrompt.trim() && !busy

  async function submit(): Promise<void> {
    if (!canCreate) return
    setBusy(true)
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        model,
        color,
        icon: icon.trim() || undefined,
        department: department.trim() || undefined,
        systemPrompt: systemPrompt.trim()
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop active" onClick={onCancel}>
      <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">🧑‍💻 New Agent</div>
        <div className="dialog-body">
          Creates a new <code>.claude/agents/&lt;name&gt;.md</code> file in this project.
        </div>

        <div className="field-grid">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mobile-agent" />
          </label>
          <label>
            Icon (emoji, optional)
            <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📱" />
          </label>
        </div>

        <label className="field-block">
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Use this agent for all work on the mobile app..."
          />
        </label>

        <div className="field-grid">
          <label>
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Color
            <select value={color} onChange={(e) => setColor(e.target.value)}>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Department (optional)
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Mobile"
            />
          </label>
        </div>

        <label className="field-block">
          System prompt
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={8}
            placeholder="You are the mobile development agent for..."
          />
        </label>

        <div className="dialog-actions">
          <button className="dialog-button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="dialog-button primary" onClick={submit} disabled={!canCreate}>
            {busy ? 'Creating…' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
