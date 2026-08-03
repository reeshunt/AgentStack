import { useEffect, useState } from 'react'
import type { AgentInfo } from '../../../shared/types'
import { departmentColor, UNASSIGNED_DEPARTMENT } from '../theme'

type Props = {
  agent: AgentInfo
  projectPath: string
  onClose: () => void
}

export default function AgentInfoDialog({ agent, projectPath, onClose }: Props): React.JSX.Element {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.agentstack.readAgentPrompt(projectPath, agent.name).then((result) => {
      if (cancelled) return
      setSystemPrompt(result?.systemPrompt ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [projectPath, agent.name])

  return (
    <div className="dialog-backdrop active" onClick={onClose}>
      <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="dialog-title">
            {agent.icon ?? '🤖'} {agent.name}
          </div>
          <button className="dialog-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-content">
          <div className="field-grid">
            <label>
              Department
              <div
                className="template-department"
                style={{
                  color: departmentColor(agent.department?.trim() || UNASSIGNED_DEPARTMENT),
                  borderColor: 'currentColor',
                  width: 'fit-content'
                }}
              >
                {agent.department?.trim() || UNASSIGNED_DEPARTMENT}
              </div>
            </label>
            <label>
              Model
              <div>{agent.model ?? 'default model'}</div>
            </label>
          </div>

          <label className="field-block">
            Description
            <div className="dialog-body" style={{ marginBottom: 0 }}>
              {agent.description ?? 'No description set.'}
            </div>
          </label>

          <label className="field-block">
            Full instructions (system prompt)
            <pre className="tool-input" style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {loading ? 'Loading…' : (systemPrompt ?? 'No instructions found for this agent.')}
            </pre>
          </label>
        </div>
        <div className="dialog-actions">
          <button className="dialog-button primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
