import { useEffect, useRef, useState } from 'react'
import type { Project } from '../../../shared/types'

const FLOOR_ICONS = ['🏢', '🧬', '🎨', '📦', '🤖', '🚀', '🛠️', '📊']

function floorIcon(index: number): string {
  return FLOOR_ICONS[index % FLOOR_ICONS.length]
}

type Props = {
  projects: Project[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
}

export default function FloorPicker({
  projects,
  selectedId,
  onSelect,
  onAdd,
  onRemove
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedIndex = projects.findIndex((p) => p.id === selectedId)
  const selected = selectedIndex >= 0 ? projects[selectedIndex] : null

  useEffect(() => {
    if (!open) return
    const onClickAway = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [open])

  return (
    <div className="floor-picker" ref={rootRef}>
      <div className="floor-picker-trigger" onClick={() => setOpen((v) => !v)}>
        <div className="floor-picker-icon">{selected ? floorIcon(selectedIndex) : '🏢'}</div>
        <div className="floor-picker-text">
          <div className="floor-picker-name" title={selected?.path}>
            {selected?.name ?? 'Add a project'}
          </div>
        </div>
        <span className="floor-picker-chevron">▾</span>
      </div>

      {open && (
        <div className="floor-picker-menu">
          {projects.map((project, i) => (
            <div
              key={project.id}
              className={`floor-picker-item ${project.id === selectedId ? 'active' : ''}`}
              onClick={() => {
                onSelect(project.id)
                setOpen(false)
              }}
            >
              <div className="floor-picker-item-icon">{floorIcon(i)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="floor-picker-item-num">Floor {i + 1}</div>
                <div className="floor-picker-item-name">{project.name}</div>
              </div>
              <button
                className="floor-picker-item-remove"
                title="Remove project"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(project.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
          <div className="floor-picker-divider" />
          <div
            className="floor-picker-item floor-picker-add"
            onClick={() => {
              setOpen(false)
              onAdd()
            }}
          >
            <div className="floor-picker-item-icon">➕</div>
            <div className="floor-picker-item-name">Add Floor</div>
          </div>
        </div>
      )}
    </div>
  )
}
