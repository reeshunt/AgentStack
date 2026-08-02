import { useRef, useState } from 'react'
import type { AgentGroup, AgentInfo, DeskLayout, Project } from '../../../shared/types'
import FloorPicker from './FloorPicker'

type Props = {
  project: Project | null
  projects: Project[]
  agents: AgentInfo[]
  statuses: Record<string, string>
  selectedAgent: string | null
  layout: DeskLayout[]
  onSelectProject: (id: string) => void
  onAddProject: () => void
  onRemoveProject: (id: string) => void
  onSelectAgent: (agentName: string) => void
  onAddAgent: () => void
  onEditAgent: (agent: AgentInfo) => void
  onGenerateAgents: () => void
  generating: boolean
  groups: AgentGroup[]
  picking: boolean
  pickedAgents: string[]
  onTogglePicking: () => void
  onTogglePick: (agentName: string) => void
  onCreateGroup: () => void
  onDeleteGroup: (groupId: string) => void
  onMoveDesk: (agentName: string, x: number, y: number) => void
}

const DESK_W = 100
const DESK_H = 130
const DRAG_THRESHOLD = 4

function defaultPosition(index: number): { x: number; y: number } {
  const cols = 6
  return {
    x: 20 + (index % cols) * (DESK_W + 30),
    y: 20 + Math.floor(index / cols) * (DESK_H + 30)
  }
}

export default function DeskGrid(props: Props): React.JSX.Element {
  const {
    project,
    projects,
    agents,
    statuses,
    selectedAgent,
    layout,
    onSelectProject,
    onAddProject,
    onRemoveProject,
    onSelectAgent,
    onAddAgent,
    onEditAgent,
    onGenerateAgents,
    generating,
    groups,
    picking,
    pickedAgents,
    onTogglePicking,
    onTogglePick,
    onCreateGroup,
    onDeleteGroup,
    onMoveDesk
  } = props

  const runningCount = Object.values(statuses).filter(
    (s) => s === 'running' || s === 'thinking'
  ).length

  const layoutByName = new Map(layout.map((l) => [l.agentName, l]))
  const canvasRef = useRef<HTMLDivElement>(null)
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({})
  const dragState = useRef<{
    agentName: string
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)

  function positionFor(agent: AgentInfo, index: number): { x: number; y: number } {
    if (dragPositions[agent.name]) return dragPositions[agent.name]
    const saved = layoutByName.get(agent.name)
    if (saved?.x !== undefined && saved?.y !== undefined) return { x: saved.x, y: saved.y }
    return defaultPosition(index)
  }

  function handlePointerDown(e: React.PointerEvent, agent: AgentInfo, pos: { x: number; y: number }): void {
    if (picking) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragState.current = {
      agentName: agent.name,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false
    }
  }

  function handlePointerMove(e: React.PointerEvent): void {
    const drag = dragState.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    drag.moved = true
    const canvasRect = canvasRef.current?.getBoundingClientRect()
    let x = drag.originX + dx
    let y = drag.originY + dy
    if (canvasRect) {
      x = Math.max(0, Math.min(x, canvasRect.width - DESK_W))
      y = Math.max(0, Math.min(y, canvasRect.height - DESK_H))
    }
    setDragPositions((prev) => ({ ...prev, [drag.agentName]: { x, y } }))
  }

  function handlePointerUp(e: React.PointerEvent, agent: AgentInfo): void {
    const drag = dragState.current
    dragState.current = null
    if (!drag) return
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    if (drag.moved) {
      const pos = dragPositions[agent.name] ?? { x: drag.originX, y: drag.originY }
      onMoveDesk(agent.name, pos.x, pos.y)
    } else if (picking) {
      onTogglePick(agent.name)
    } else {
      onSelectAgent(agent.name)
    }
  }

  function renderDesk(agent: AgentInfo, index: number): React.JSX.Element {
    const status = statuses[agent.name] ?? 'idle'
    const needsBadge = status === 'needs_input' || status === 'error' || status === 'done'
    const badgeText =
      status === 'error' ? '!' : status === 'needs_input' ? '?' : status === 'done' ? '✓' : ''
    const picked = pickedAgents.includes(agent.name)
    const pos = positionFor(agent, index)
    const savedAppearance = layoutByName.get(agent.name)
    const collarStyle =
      status === 'idle' && savedAppearance?.suitColor
        ? { background: savedAppearance.suitColor }
        : undefined
    const surfaceStyle = savedAppearance?.deskColor
      ? { background: savedAppearance.deskColor }
      : undefined

    return (
      <div
        className={`desk-unit desk-unit-free ${agent.name === selectedAgent ? 'desk-unit-selected' : ''} ${picking ? 'desk-unit-picking' : ''} ${picked ? 'desk-unit-picked' : ''}`}
        key={agent.name}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={(e) => handlePointerDown(e, agent, pos)}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => handlePointerUp(e, agent)}
      >
        {picking && <div className="desk-pick-check">{picked ? '✓' : ''}</div>}
        <button
          className="desk-edit-button"
          onClick={(e) => {
            e.stopPropagation()
            onEditAgent(agent)
          }}
          title="Edit agent"
        >
          ✏️
        </button>
        <div className="desk-surface junior-surface" style={surfaceStyle}>
          <div className={`monitor status-${status}`} />
          <div className="phone" />
        </div>
        <div className={`character status-${status}`}>
          <div className="character-head" />
          <div className="character-collar" style={collarStyle} />
          {needsBadge && <div className={`notif-badge ${status}`}>{badgeText}</div>}
        </div>
        <div className="char-name">
          {agent.icon} {agent.name}
        </div>
        <div className="char-role">{agent.description ?? agent.model ?? 'Subagent'}</div>
      </div>
    )
  }

  const allDesks = agents.map((a, i) => renderDesk(a, i))

  return (
    <div className="office-floor">
      <div className="office-floor-bg" />
      <div className="office-floor-scrim" />
      <div className="office-floor-content">
        <div className="office-floor-header">
          <FloorPicker
            projects={projects}
            selectedId={project?.id ?? null}
            onSelect={onSelectProject}
            onAdd={onAddProject}
            onRemove={onRemoveProject}
          />
          {project && (
            <div className="office-floor-stats">
              <span className="office-stat">
                <span className={`office-stat-dot ${runningCount > 0 ? 'running' : ''}`} />
                {runningCount} working
              </span>
              <span className="office-stat">{agents.length} agents on this floor</span>
              <button className="add-agent-button" onClick={onAddAgent}>
                + Add Agent
              </button>
              <button
                className="add-agent-button generate-button"
                onClick={onGenerateAgents}
                disabled={generating}
              >
                {generating ? '🪄 Generating…' : '🪄 Generate Agents'}
              </button>
              <button className="add-agent-button" onClick={onTogglePicking}>
                {picking ? 'Cancel' : '👥 Group Agents'}
              </button>
              {picking && (
                <button
                  className="add-agent-button generate-button"
                  onClick={onCreateGroup}
                  disabled={pickedAgents.length < 2}
                >
                  Create Group ({pickedAgents.length})
                </button>
              )}
            </div>
          )}
        </div>

        {!project ? (
          <div className="empty-floor">Add a project folder to see its agents here.</div>
        ) : agents.length === 0 ? (
          <div className="empty-floor">
            No agents assigned to this folder yet. Add agent definitions under{' '}
            <code>{project.path}/.claude/agents/*.md</code>, or use{' '}
            <button className="link-button" onClick={onAddAgent}>
              + Add Agent
            </button>
            .
          </div>
        ) : (
          <>
            {groups.length > 0 && (
              <div className="group-legend">
                {groups.map((g) => (
                  <div className="group-legend-item" key={g.id}>
                    👥 {g.name} ({g.agentNames.length})
                    <button className="delete-group-button" onClick={() => onDeleteGroup(g.id)}>
                      Ungroup
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="office-floor-canvas" ref={canvasRef}>
              {allDesks}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
