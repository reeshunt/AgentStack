import { useState } from 'react'
import { AGENT_TEMPLATES } from '../../../shared/agentTemplates'

type Props = {
  projectName: string
  existingNames: string[]
  onClose: () => void
  onCreate: (templateIds: string[]) => Promise<void>
}

export default function GenerateAgentsDialog({
  projectName,
  existingNames,
  onClose,
  onCreate
}: Props): React.JSX.Element {
  const existing = new Set(existingNames)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(AGENT_TEMPLATES.filter((t) => !existing.has(t.name)).map((t) => t.id))
  )
  const [busy, setBusy] = useState(false)

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(): Promise<void> {
    if (selected.size === 0 || busy) return
    setBusy(true)
    try {
      await onCreate([...selected])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop active" onClick={busy ? undefined : onClose}>
      <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="dialog-title">🪄 Generate Agents — {projectName}</div>
          <button className="dialog-close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="dialog-content">
          <div className="dialog-body">
            Pick from a set of ready-made subagents to add to <code>.claude/agents/*.md</code>. Each
            one starts by reading this project to learn its real stack — nothing is scanned up front.
          </div>

          <div className="template-list">
            {AGENT_TEMPLATES.map((t) => {
              const alreadyAdded = existing.has(t.name)
              return (
                <label
                  key={t.id}
                  className={`template-row${alreadyAdded ? ' template-row-disabled' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    disabled={alreadyAdded}
                    onChange={() => toggle(t.id)}
                  />
                  <span className="template-icon">{t.icon}</span>
                  <span className="template-info">
                    <span className="template-name">
                      {t.name}
                      {t.department && <span className="template-department">{t.department}</span>}
                      {alreadyAdded && <span className="template-department">already added</span>}
                    </span>
                    <span className="template-description">{t.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="dialog-actions">
          <button className="dialog-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="dialog-button primary"
            onClick={submit}
            disabled={selected.size === 0 || busy}
          >
            {busy ? 'Adding…' : `Add ${selected.size || ''} Agent${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
