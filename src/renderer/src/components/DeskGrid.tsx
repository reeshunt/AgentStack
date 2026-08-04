import { useLayoutEffect, useRef, useState } from 'react'
import type { AgentInfo, DeskLayout, OrchestrationEvent, Project } from '../../../shared/types'
import { departmentColor, statusPulses, STATUS_COLORS, STATUS_LABELS, UNASSIGNED_DEPARTMENT } from '../theme'
import FloorPicker from './FloorPicker'
import DelegationOverlay from './DelegationOverlay'
import AgentDeskSprite from './AgentDeskSprite'
import floorTileImg from '../../../../resources/assets/floor.png'
import officeBgImg from '../../../../resources/assets/spritesheets/office/office_bg.png'

type Props = {
  project: Project | null
  projects: Project[]
  agents: AgentInfo[]
  statuses: Record<string, string>
  celebratingAgents: string[]
  selectedAgent: string | null
  layout: DeskLayout[]
  activeDelegations: OrchestrationEvent[]
  onMoveDesk: (agentName: string, x: number, y: number) => void
  onDeselectAgent: () => void
  onSelectProject: (id: string) => void
  onAddProject: () => void
  onRemoveProject: (id: string) => void
  onSelectAgent: (agentName: string) => void
  onAddAgent: () => void
  onEditAgent: (agent: AgentInfo) => void
  onDeleteAgent: (agent: AgentInfo) => void
  onGenerateAgents: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  recentAgentNames: string[]
  deptFilter: string | null
  onToggleDept: (department: string) => void
  onShowAllDepartments: () => void
}

function departmentOf(agent: AgentInfo): string {
  return agent.department?.trim() || UNASSIGNED_DEPARTMENT
}

// Free-form floor canvas. Small rosters get a canvas sized to exactly fill the visible floor
// area (no scrollbar) instead of a canvas padded out to a large fixed size; only once there
// are enough desks that they'd genuinely need more room does the floor grow to this large
// fixed size and start scrolling.
const LARGE_CANVAS_WIDTH = 2400
const LARGE_CANVAS_HEIGHT = 1600
const SCROLL_AGENT_THRESHOLD = 20
const DESK_WIDTH = 150
const DESK_HEIGHT = 130
// Fallback layout for a desk that's never been dragged yet — loose cascading grid so new
// agents don't all stack exactly on top of each other at the origin.
const DEFAULT_SPACING_X = 180
const DEFAULT_SPACING_Y = 160
const DEFAULT_GRID_Y = 24

// Simulator-style scroll-wheel zoom on the office floor. Zooming out is capped at 10% below
// the default view (not a wide-open "zoom to a dot") while zooming in has more headroom.
const ZOOM_DEFAULT = 1
const ZOOM_MIN = 0.9
const ZOOM_MAX = 1.6
const ZOOM_WHEEL_SENSITIVITY = 0.0015

function clampZoom(value: number): number {
  return Math.min(Math.max(value, ZOOM_MIN), ZOOM_MAX)
}

// Columns wrap to whatever actually fits the current canvas width instead of a fixed count,
// and the final spot is clamped into the canvas bounds — otherwise a freshly generated agent
// can default to a grid slot that's off the edge of a canvas sized for a small roster (no
// scrollbar to reach it, so the desk is just invisible).
function defaultPosition(
  index: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const columns = Math.max(1, Math.floor((canvasWidth - 24) / DEFAULT_SPACING_X))
  const x = 24 + (index % columns) * DEFAULT_SPACING_X
  const y = DEFAULT_GRID_Y + Math.floor(index / columns) * DEFAULT_SPACING_Y
  return {
    x: clamp(x, canvasWidth - DESK_WIDTH),
    y: clamp(y, canvasHeight - DESK_HEIGHT)
  }
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max)
}

type DragState = { agentName: string; x: number; y: number; moved: boolean }

export default function DeskGrid(props: Props): React.JSX.Element {
  const {
    project,
    projects,
    agents,
    statuses,
    celebratingAgents,
    selectedAgent,
    layout,
    activeDelegations,
    onMoveDesk,
    onDeselectAgent,
    onSelectProject,
    onAddProject,
    onRemoveProject,
    onSelectAgent,
    onAddAgent,
    onEditAgent,
    onDeleteAgent,
    onGenerateAgents,
    sidebarCollapsed,
    onToggleSidebar,
    recentAgentNames,
    deptFilter,
    onToggleDept,
    onShowAllDepartments
  } = props

  const runningCount = Object.values(statuses).filter(
    (s) => s === 'running' || s === 'thinking'
  ).length

  const officeFloorRef = useRef<HTMLDivElement>(null)
  const canvasScrollRef = useRef<HTMLDivElement>(null)
  const deskRefs = useRef(new Map<string, HTMLDivElement>())
  const trashRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoveringTrash, setHoveringTrash] = useState(false)
  // Measured size of the visible floor area — used as the canvas size for small rosters so
  // the floor exactly fills the viewport with no scrollbar, instead of always padding out to
  // the large fixed canvas.
  const [viewportSize, setViewportSize] = useState({ width: 960, height: 640 })
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)
  // Whether the pointer moved enough during this press to count as a drag rather than a
  // click. Tracked in a ref (not state) so the click handler sees it synchronously — a
  // pointerup-triggered setState hasn't necessarily re-rendered yet by the time the
  // browser's own follow-up 'click' event fires.
  const suppressClickRef = useRef(false)

  useLayoutEffect(() => {
    const el = canvasScrollRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setViewportSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layoutByName = new Map(layout.map((l) => [l.agentName, l]))
  const agentByName = new Map(agents.map((a) => [a.name, a]))

  const departmentNames: string[] = []
  const byDepartment = new Map<string, AgentInfo[]>()
  for (const agent of agents) {
    const dept = departmentOf(agent)
    if (!byDepartment.has(dept)) {
      byDepartment.set(dept, [])
      departmentNames.push(dept)
    }
    byDepartment.get(dept)!.push(agent)
  }

  const recentAgents = recentAgentNames
    .map((name) => agentByName.get(name))
    .filter((a): a is AgentInfo => Boolean(a))
    .slice(0, 5)

  const celebrating = new Set(celebratingAgents)

  const visibleAgents = agents.filter((a) => !deptFilter || departmentOf(a) === deptFilter)

  // Below the threshold, the canvas is exactly the measured floor area (no scrollbar); past
  // it, the floor grows to the large fixed canvas and starts scrolling like before.
  const needsScroll = agents.length > SCROLL_AGENT_THRESHOLD
  const canvasWidth = needsScroll ? LARGE_CANVAS_WIDTH : Math.max(viewportSize.width, DESK_WIDTH)
  const canvasHeight = needsScroll ? LARGE_CANVAS_HEIGHT : Math.max(viewportSize.height, DESK_HEIGHT)
  const fmPinnedX = Math.round((canvasWidth - DESK_WIDTH) / 2)
  const fmPinnedY = Math.round((canvasHeight - DESK_HEIGHT) / 2)

  // Default-position index counts only non-FM agents (the FM doesn't occupy a grid slot —
  // it's pinned separately — so without this, whichever agent lands at index 0 would default
  // to the exact same spot as the pinned FM and render invisibly underneath it).
  const defaultIndexByName = new Map<string, number>()
  let nextDefaultIndex = 0
  for (const agent of visibleAgents) {
    if (agent.isFloorManager) continue
    defaultIndexByName.set(agent.name, nextDefaultIndex)
    nextDefaultIndex += 1
  }

  function positionFor(agent: AgentInfo): { x: number; y: number } {
    if (agent.isFloorManager) return { x: fmPinnedX, y: fmPinnedY }
    if (drag && drag.agentName === agent.name) return { x: drag.x, y: drag.y }
    const saved = layoutByName.get(agent.name)
    if (saved?.x !== undefined && saved?.y !== undefined) return { x: saved.x, y: saved.y }
    return defaultPosition(defaultIndexByName.get(agent.name) ?? 0, canvasWidth, canvasHeight)
  }

  function startDrag(agent: AgentInfo, e: React.PointerEvent<HTMLDivElement>): void {
    if (agent.isFloorManager) return
    e.currentTarget.setPointerCapture(e.pointerId)
    suppressClickRef.current = false
    const start = positionFor(agent)
    setDrag({ agentName: agent.name, x: start.x, y: start.y, moved: false })
  }

  function isOverTrash(clientX: number, clientY: number): boolean {
    const el = trashRef.current
    if (!el) return false
    const rect = el.getBoundingClientRect()
    return (
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    )
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>): void {
    setHoveringTrash(isOverTrash(e.clientX, e.clientY))
    setDrag((prev) => {
      if (!prev) return prev
      const moved = prev.moved || Math.abs(e.movementX) + Math.abs(e.movementY) > 2
      if (moved) suppressClickRef.current = true
      // Pointer movement is in screen pixels, but desk positions live in the floor-canvas's
      // unscaled coordinate space (the canvas itself is what gets CSS-scaled) — so screen
      // movement has to be un-zoomed before it's applied.
      return {
        ...prev,
        x: clamp(prev.x + e.movementX / zoom, canvasWidth - DESK_WIDTH),
        y: clamp(prev.y + e.movementY / zoom, canvasHeight - DESK_HEIGHT),
        moved
      }
    })
  }

  // Wheel-to-zoom, anchored on the pointer so the point under the cursor stays put — the
  // same feel as a scroll-wheel zoom in a city-builder/simulator game.
  function onFloorWheel(e: React.WheelEvent<HTMLDivElement>): void {
    const container = canvasScrollRef.current
    if (!container) return
    e.preventDefault()
    const rect = container.getBoundingClientRect()
    const pointerX = e.clientX - rect.left + container.scrollLeft
    const pointerY = e.clientY - rect.top + container.scrollTop
    const prevZoom = zoom
    const nextZoom = clampZoom(prevZoom - e.deltaY * ZOOM_WHEEL_SENSITIVITY)
    if (nextZoom === prevZoom) return
    const ratio = nextZoom / prevZoom
    setZoom(nextZoom)
    requestAnimationFrame(() => {
      container.scrollLeft = pointerX * ratio - (e.clientX - rect.left)
      container.scrollTop = pointerY * ratio - (e.clientY - rect.top)
    })
  }

  function endDrag(agent: AgentInfo): void {
    const droppedOnTrash = hoveringTrash
    setHoveringTrash(false)
    setDrag((prev) => {
      if (!prev || prev.agentName !== agent.name) return prev
      if (prev.moved && droppedOnTrash) {
        if (window.confirm(`Delete agent "${agent.name}"? This removes its agent file from disk.`)) {
          onDeleteAgent(agent)
        }
      } else if (prev.moved) {
        onMoveDesk(agent.name, prev.x, prev.y)
      }
      return null
    })
  }

  function renderDeskCard(agent: AgentInfo): React.JSX.Element {
    const status = statuses[agent.name] ?? 'idle'
    const appearance = layoutByName.get(agent.name)
    const deptColor = departmentColor(departmentOf(agent))
    const iconBg = appearance?.suitColor ?? deptColor
    const statusColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.idle
    const isCelebrating = celebrating.has(agent.name)
    const isDragging = drag?.agentName === agent.name
    const pos = positionFor(agent)

    return (
      <div
        key={agent.name}
        ref={(el) => {
          if (el) deskRefs.current.set(agent.name, el)
          else deskRefs.current.delete(agent.name)
        }}
        className={`desk-card ${agent.name === selectedAgent ? 'desk-card-selected' : ''} ${isCelebrating ? 'desk-card-celebrate' : ''} ${isDragging ? 'desk-card-dragging' : ''} ${agent.isFloorManager ? 'desk-card-pinned' : ''}`}
        style={{
          left: pos.x,
          top: pos.y,
          ...(isCelebrating ? ({ '--dept-glow': deptColor } as React.CSSProperties) : undefined)
        }}
        onPointerDown={(e) => startDrag(agent, e)}
        onPointerMove={isDragging ? onDragMove : undefined}
        onPointerUp={() => endDrag(agent)}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          onSelectAgent(agent.name)
        }}
      >
        <button
          className="desk-edit-button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onEditAgent(agent)
          }}
          title="Edit agent"
        >
          ✏️
        </button>
        {agent.isFloorManager ? (
          <>
            <div className="desk-card-name desk-card-ceo-name">{agent.name}</div>
            <div className="desk-card-ceo-sprite-wrap">
              <AgentDeskSprite animate={statusPulses(status as never)} variant="floorManager" />
            </div>
            <div className="desk-card-ceo-status-row">
              <div
                className="desk-card-status-dot"
                style={{
                  background: statusColor,
                  animation: statusPulses(status as never) ? 'pulseDot 1.6s infinite' : 'none',
                  boxShadow: `0 0 6px ${statusColor}`
                }}
              />
              <span className="desk-card-activity">
                {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? 'Idle'}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="desk-card-name">{agent.name}</div>
            <div className="desk-card-cubicle-wrap">
              <div className="desk-card-cubicle-inner">
                <AgentDeskSprite
                  animate={statusPulses(status as never)}
                  variant={agent.icon === '⚙️' ? 'devops' : 'dev'}
                />
                <div className="desk-card-cubicle-icon" style={{ background: iconBg }}>
                  {agent.icon ?? agent.name[0]?.toUpperCase()}
                </div>
                <div
                  className="desk-card-status-dot desk-card-cubicle-dot"
                  style={{
                    background: statusColor,
                    animation: statusPulses(status as never) ? 'pulseDot 1.6s infinite' : 'none',
                    boxShadow: `0 0 6px ${statusColor}`
                  }}
                />
              </div>
            </div>
            <div className="desk-card-meta">
              {departmentOf(agent)} · {agent.model ?? 'default'}
            </div>
            <div className="desk-card-activity">
              {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? 'Idle'}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="office-floor" ref={officeFloorRef}>
      <div className="office-floor-bg" style={{ backgroundImage: `url(${floorTileImg})` }} />
      <DelegationOverlay
        delegations={activeDelegations.filter((d) => d.status === 'active')}
        deskRefs={deskRefs.current}
        containerRef={officeFloorRef}
      />
      {drag && (
        <div
          ref={trashRef}
          className={`desk-trash-zone ${hoveringTrash ? 'desk-trash-zone-active' : ''}`}
          title="Drop here to delete agent"
        >
          🗑️
        </div>
      )}
      <div className="office-floor-content">
        <div className="office-floor-header">
          <div className="office-floor-header-left">
            <button className="sidebar-toggle" onClick={onToggleSidebar} title="Toggle sidebar">
              ☰
            </button>
            <FloorPicker
              projects={projects}
              selectedId={project?.id ?? null}
              onSelect={onSelectProject}
              onAdd={onAddProject}
              onRemove={onRemoveProject}
            />
          </div>
          {project && (
            <div className="office-floor-stats">
              <span className="office-stat">
                <span className={`office-stat-dot ${runningCount > 0 ? 'running' : ''}`} />
                {runningCount} working
              </span>
              <span className="office-stat">{agents.length} agents on this floor</span>
              <div className="zoom-controls">
                <button
                  className="zoom-button"
                  onClick={() => setZoom((z) => clampZoom(z - 0.1))}
                  disabled={zoom <= ZOOM_MIN}
                  title="Zoom out"
                >
                  −
                </button>
                <button
                  className="zoom-reset"
                  onClick={() => setZoom(ZOOM_DEFAULT)}
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="zoom-button"
                  onClick={() => setZoom((z) => clampZoom(z + 0.1))}
                  disabled={zoom >= ZOOM_MAX}
                  title="Zoom in"
                >
                  +
                </button>
              </div>
              <button className="add-agent-button" onClick={onAddAgent}>
                + Add Agent
              </button>
              <button className="add-agent-button generate-button" onClick={onGenerateAgents}>
                🪄 Generate Agents
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {!sidebarCollapsed && (
            <div className="app-sidebar">
              {recentAgents.length > 0 && (
                <div>
                  <div className="app-sidebar-section-label">Recent</div>
                  {recentAgents.map((a) => (
                    <button
                      key={a.name}
                      className="app-sidebar-item"
                      onClick={() => onSelectAgent(a.name)}
                    >
                      <span>{a.icon}</span>
                      <span>{a.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {departmentNames.length > 0 && (
                <div>
                  <div className="app-sidebar-section-label">Departments</div>
                  <button
                    className={`app-sidebar-dept-item ${deptFilter === null ? 'active' : ''}`}
                    onClick={onShowAllDepartments}
                  >
                    <span>All</span>
                    <span className="app-sidebar-dept-count">{agents.length}</span>
                  </button>
                  {departmentNames.map((dept) => (
                    <button
                      key={dept}
                      className={`app-sidebar-dept-item ${deptFilter === dept ? 'active' : ''}`}
                      onClick={() => onToggleDept(dept)}
                    >
                      <span>{dept}</span>
                      <span className="app-sidebar-dept-count">{byDepartment.get(dept)!.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {!project ? (
              <div className="office-floor-empty">
                <div className="empty-floor">Add a project folder to see its agents here.</div>
              </div>
            ) : agents.length === 0 ? (
              <div className="office-floor-empty">
                <div className="empty-floor">
                  No agents assigned to this folder yet. Add agent definitions under{' '}
                  <code>{project.path}/.claude/agents/*.md</code>, or use{' '}
                  <button className="link-button" onClick={onAddAgent}>
                    + Add Agent
                  </button>
                  .
                </div>
              </div>
            ) : (
              <div
                className="floor-canvas-scroll"
                ref={canvasScrollRef}
                onWheel={onFloorWheel}
                style={needsScroll || zoom !== 1 ? undefined : { overflow: 'hidden' }}
              >
                <div
                  className="floor-canvas-zoom-frame"
                  style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}
                >
                  <div
                    className="floor-canvas"
                    style={{
                      width: canvasWidth,
                      height: canvasHeight,
                      transform: `scale(${zoom})`,
                      transformOrigin: '0 0'
                    }}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) onDeselectAgent()
                    }}
                  >
                    <div
                      className="floor-canvas-bg"
                      style={{ backgroundImage: `url(${officeBgImg})` }}
                    />
                    {visibleAgents.map((agent) => renderDeskCard(agent))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
