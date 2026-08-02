import type { AgentGroup, AgentInfo, Project } from '../../../shared/types'
import FloorPicker from './FloorPicker'

const UNGROUPED = 'General'

type Props = {
  project: Project | null
  projects: Project[]
  agents: AgentInfo[]
  statuses: Record<string, string>
  selectedAgent: string | null
  onSelectProject: (id: string) => void
  onAddProject: () => void
  onRemoveProject: (id: string) => void
  onSelectAgent: (agentName: string) => void
  onAddAgent: () => void
  onGenerateAgents: () => void
  generating: boolean
  groups: AgentGroup[]
  picking: boolean
  pickedAgents: string[]
  onTogglePicking: () => void
  onTogglePick: (agentName: string) => void
  onCreateGroup: () => void
  onDeleteGroup: (groupId: string) => void
}

function groupByDepartment(agents: AgentInfo[]): Array<[string, AgentInfo[]]> {
  const groups = new Map<string, AgentInfo[]>()
  for (const agent of agents) {
    const dept = agent.department?.trim() || UNGROUPED
    const list = groups.get(dept)
    if (list) list.push(agent)
    else groups.set(dept, [agent])
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === UNGROUPED) return 1
    if (b === UNGROUPED) return -1
    return a.localeCompare(b)
  })
}

export default function DeskGrid(props: Props): React.JSX.Element {
  const {
    project,
    projects,
    agents,
    statuses,
    selectedAgent,
    onSelectProject,
    onAddProject,
    onRemoveProject,
    onSelectAgent,
    onAddAgent,
    onGenerateAgents,
    generating,
    groups,
    picking,
    pickedAgents,
    onTogglePicking,
    onTogglePick,
    onCreateGroup,
    onDeleteGroup
  } = props

  const runningCount = Object.values(statuses).filter(
    (s) => s === 'running' || s === 'thinking'
  ).length

  const groupedNames = new Set(groups.flatMap((g) => g.agentNames))
  const ungroupedAgents = agents.filter((a) => !groupedNames.has(a.name))
  const departments = groupByDepartment(ungroupedAgents)

  function renderDesk(agent: AgentInfo): React.JSX.Element {
    const status = statuses[agent.name] ?? 'idle'
    const needsBadge = status === 'needs_input' || status === 'error' || status === 'done'
    const badgeText =
      status === 'error' ? '!' : status === 'needs_input' ? '?' : status === 'done' ? '✓' : ''
    const picked = pickedAgents.includes(agent.name)
    return (
      <div
        className={`desk-unit ${agent.name === selectedAgent ? 'desk-unit-selected' : ''} ${picking ? 'desk-unit-picking' : ''} ${picked ? 'desk-unit-picked' : ''}`}
        key={agent.name}
        onClick={() => (picking ? onTogglePick(agent.name) : onSelectAgent(agent.name))}
      >
        {picking && <div className="desk-pick-check">{picked ? '✓' : ''}</div>}
        <div className="desk-surface junior-surface">
          <div className={`monitor status-${status}`} />
          <div className="phone" />
        </div>
        <div className={`character status-${status}`}>
          <div className="character-head" />
          <div className="character-collar" />
          {needsBadge && <div className={`notif-badge ${status}`}>{badgeText}</div>}
        </div>
        <div className="char-name">
          {agent.icon} {agent.name}
        </div>
        <div className="char-role">{agent.description ?? agent.model ?? 'Subagent'}</div>
      </div>
    )
  }

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
          <div className="departments">
            {groups.map((group) => {
              const members = agents.filter((a) => group.agentNames.includes(a.name))
              if (members.length === 0) return null
              return (
                <div className="department" key={group.id}>
                  <div className="department-label department-label-group">
                    👥 {group.name}
                    <button className="delete-group-button" onClick={() => onDeleteGroup(group.id)}>
                      Ungroup
                    </button>
                  </div>
                  <div className="floor-plan">{members.map(renderDesk)}</div>
                </div>
              )
            })}

            {departments.map(([department, deptAgents]) => (
              <div className="department" key={department}>
                {(departments.length > 1 || groups.length > 0) && (
                  <div className="department-label">{department}</div>
                )}
                <div className="floor-plan">{deptAgents.map(renderDesk)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
