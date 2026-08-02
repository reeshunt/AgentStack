import { useEffect, useState } from 'react'
import type { AgentInfo, DeskLayout, NewAgentInput } from '../../../shared/types'

const MODEL_OPTIONS = ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5']
const COLOR_OPTIONS = ['blue', 'purple', 'green', 'orange', 'red', 'yellow']

type Props = {
  agent: AgentInfo
  projectPath: string
  layout: DeskLayout
  onCancel: () => void
  onSaveAgent: (filePath: string, input: NewAgentInput) => Promise<void>
  onSaveAppearance: (agentName: string, suitColor?: string, deskColor?: string) => Promise<void>
}

export default function EditAgentDialog({
  agent,
  projectPath,
  layout,
  onCancel,
  onSaveAgent,
  onSaveAppearance
}: Props): React.JSX.Element {
  const [description, setDescription] = useState(agent.description ?? '')
  const [model, setModel] = useState(agent.model ?? MODEL_OPTIONS[0])
  const [color, setColor] = useState(agent.color ?? COLOR_OPTIONS[0])
  const [department, setDepartment] = useState(agent.department ?? '')
  const [icon, setIcon] = useState(agent.icon ?? '')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [suitColor, setSuitColor] = useState(layout.suitColor ?? '#6b7280')
  const [deskColor, setDeskColor] = useState(layout.deskColor ?? '#3a3d4d')
  const [loadingPrompt, setLoadingPrompt] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.agentstack.readAgentPrompt(projectPath, agent.name).then((result) => {
      if (cancelled) return
      setSystemPrompt(result?.systemPrompt ?? '')
      setLoadingPrompt(false)
    })
    return () => {
      cancelled = true
    }
  }, [projectPath, agent.name])

  async function submit(): Promise<void> {
    setBusy(true)
    try {
      await onSaveAgent(agent.filePath, {
        name: agent.name,
        description: description.trim(),
        model,
        color,
        icon: icon.trim() || undefined,
        department: department.trim() || undefined,
        systemPrompt: systemPrompt.trim()
      })
      await onSaveAppearance(agent.name, suitColor, deskColor)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop active" onClick={onCancel}>
      <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">✏️ Edit {agent.name}</div>
        <div className="dialog-body">
          Updates <code>{agent.filePath}</code> and this agent's look on the floor.
        </div>

        <div className="field-grid">
          <label>
            Icon (emoji)
            <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📱" />
          </label>
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
        </div>

        <label className="field-block">
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="field-grid">
          <label>
            Frontmatter color
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
            <input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </label>
        </div>

        <div className="field-grid">
          <label>
            Suit color (when idle)
            <input
              type="color"
              value={suitColor}
              onChange={(e) => setSuitColor(e.target.value)}
              className="color-swatch-input"
            />
          </label>
          <label>
            Desk / table color
            <input
              type="color"
              value={deskColor}
              onChange={(e) => setDeskColor(e.target.value)}
              className="color-swatch-input"
            />
          </label>
        </div>

        <label className="field-block">
          System prompt
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={8}
            disabled={loadingPrompt}
          />
        </label>

        <div className="dialog-actions">
          <button className="dialog-button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="dialog-button primary" onClick={submit} disabled={busy || loadingPrompt}>
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
