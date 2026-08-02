import ChatRow from './ChatRow'
import type { ChatItem } from '../chatItems'

type Props = {
  projectName: string
  items: ChatItem[]
  running: boolean
  onClose: () => void
}

export default function GenerateAgentsDialog({
  projectName,
  items,
  running,
  onClose
}: Props): React.JSX.Element {
  return (
    <div className="dialog-backdrop active" onClick={running ? undefined : onClose}>
      <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">🪄 Generate Agents — {projectName}</div>
        <div className="dialog-body">
          Scanning the project and writing <code>.claude/agents/*.md</code> files for the roles
          this codebase actually needs.
        </div>

        <div className="generate-log">
          {items.length === 0 && running && <div className="chat-empty">Starting analysis…</div>}
          {items.map((item) => (
            <ChatRow key={item.id} item={item} />
          ))}
          {running && <div className="generate-spinner">⋯ working</div>}
        </div>

        <div className="dialog-actions">
          <button className="dialog-button primary" onClick={onClose} disabled={running}>
            {running ? 'Generating…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
