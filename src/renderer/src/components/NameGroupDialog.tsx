import { useState } from 'react'

type Props = {
  count: number
  onCancel: () => void
  onConfirm: (name: string) => void
}

export default function NameGroupDialog({ count, onCancel, onConfirm }: Props): React.JSX.Element {
  const [name, setName] = useState('')

  return (
    <div className="dialog-backdrop active" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">👥 Name this group</div>
        <div className="dialog-body">Grouping {count} selected agents.</div>
        <input
          className="chat-input"
          style={{ width: '100%', padding: '10px 12px' }}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onConfirm(name.trim())}
          placeholder="e.g. Checkout Team"
        />
        <div className="dialog-actions">
          <button className="dialog-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="dialog-button primary"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim())}
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  )
}
