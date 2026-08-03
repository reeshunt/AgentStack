import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentInfo,
  ClaudeCliStatus,
  DeskLayout,
  NewAgentInput,
  OrchestrationEvent,
  PermissionMode,
  Project,
  QuotaInfo
} from '../../shared/types'
import { sessionKey } from '../../shared/types'
import DeskGrid from './components/DeskGrid'
import ChatPanel from './components/ChatPanel'
import AddAgentDialog from './components/AddAgentDialog'
import EditAgentDialog from './components/EditAgentDialog'
import GenerateAgentsDialog from './components/GenerateAgentsDialog'
import QuotaBadge from './components/QuotaBadge'
import TerminalPanel from './components/TerminalPanel'
import FileViewer from './components/FileViewer'
import { AGENT_TEMPLATES } from '../../shared/agentTemplates'
import { delegationStatsChatItem, toChatItems, userChatItem, type ChatItem } from './chatItems'
import { playBellSound } from './sound'

const CELEBRATE_DURATION_MS = 4000

let itemSeq = 0
function historyChatItem(role: 'user' | 'assistant', text: string): ChatItem {
  itemSeq += 1
  return role === 'user'
    ? { kind: 'user', id: `hist-${itemSeq}`, text }
    : { kind: 'assistant-text', id: `hist-${itemSeq}`, text }
}

export default function App(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [agentsByProject, setAgentsByProject] = useState<Record<string, AgentInfo[]>>({})
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null)
  const [cliStatus, setCliStatus] = useState<ClaudeCliStatus | null>(null)
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [chatLogs, setChatLogs] = useState<Record<string, ChatItem[]>>({})
  const [hydratedKeys, setHydratedKeys] = useState<Record<string, boolean>>({})
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null)
  const [deskLayoutByProject, setDeskLayoutByProject] = useState<Record<string, DeskLayout[]>>({})
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [terminalCollapsed, setTerminalCollapsed] = useState(true)
  const [viewMode, setViewMode] = useState<'floor' | 'files'>('floor')
  const [orchestrationEvents, setOrchestrationEvents] = useState<OrchestrationEvent[]>([])
  const [recentAgentNames, setRecentAgentNames] = useState<string[]>([])
  const [deptFilter, setDeptFilter] = useState<string | null>(null)
  const [celebratingKeys, setCelebratingKeys] = useState<Set<string>>(new Set())
  const celebrateTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [permissionModeByProject, setPermissionModeByProject] = useState<
    Record<string, PermissionMode>
  >({})

  useEffect(() => {
    window.agentstack.listProjects().then((list) => {
      setProjects(list)
      if (list.length > 0) setSelectedProjectId(list[0].id)
    })
    window.agentstack.claudeCliStatus().then(setCliStatus)
  }, [])

  useEffect(() => {
    return window.agentstack.onQuotaUpdate(setQuota)
  }, [])

  // Drives the dashed-line overlay ('active' registers a delegation, 'done'/'error' clears
  // it) and appends chat items on both ends: the delegated task shows up tagged in the
  // worker's own thread, and a stats card lands in the Floor Manager's thread once it settles.
  useEffect(() => {
    return window.agentstack.onOrchestrationEvent((event) => {
      setOrchestrationEvents((prev) => {
        const withoutId = prev.filter((e) => e.id !== event.id)
        return event.status === 'active' ? [...withoutId, event] : withoutId
      })

      if (event.status === 'active' && event.task) {
        const workerKey = sessionKey(event.projectId, event.to)
        setChatLogs((prev) => ({
          ...prev,
          [workerKey]: [...(prev[workerKey] ?? []), userChatItem(event.task!, 'floor-manager')]
        }))
      }

      if ((event.status === 'done' || event.status === 'error') && event.stats) {
        const fmKey = sessionKey(event.projectId, event.from)
        const { contextPct, costUsd, numTurns } = event.stats
        setChatLogs((prev) => ({
          ...prev,
          [fmKey]: [
            ...(prev[fmKey] ?? []),
            delegationStatsChatItem(event.to, event.status as 'done' | 'error', contextPct, costUsd, numTurns)
          ]
        }))
      }
    })
  }, [])

  function celebrateCompletion(key: string): void {
    playBellSound()
    setCelebratingKeys((prev) => new Set(prev).add(key))
    clearTimeout(celebrateTimers.current[key])
    celebrateTimers.current[key] = setTimeout(() => {
      setCelebratingKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      delete celebrateTimers.current[key]
    }, CELEBRATE_DURATION_MS)
  }

  useEffect(() => {
    return window.agentstack.onSessionEvent((event) => {
      setStatuses((prev) => {
        if (event.status === 'done' && prev[event.key] !== 'done') celebrateCompletion(event.key)
        return { ...prev, [event.key]: event.status }
      })
      const newItems = toChatItems(event)
      if (newItems.length === 0) return
      setChatLogs((prev) => ({ ...prev, [event.key]: [...(prev[event.key] ?? []), ...newItems] }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handlePermissionDecision(
    key: string,
    toolUseID: string,
    approved: boolean,
    updatedInput?: Record<string, unknown>
  ): void {
    window.agentstack.respondToPermission(toolUseID, approved, undefined, updatedInput)
    setStatuses((prev) => ({ ...prev, [key]: 'running' }))
    setChatLogs((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((item) =>
        item.kind === 'permission' && item.id === toolUseID
          ? { ...item, status: approved ? 'approved' : 'denied' }
          : item
      )
    }))
  }

  useEffect(() => {
    return window.agentstack.onPermissionRequest((request) => {
      setStatuses((prev) => ({ ...prev, [request.key]: 'needs_input' }))
      setChatLogs((prev) => ({
        ...prev,
        [request.key]: [
          ...(prev[request.key] ?? []),
          {
            kind: 'permission',
            id: request.toolUseID,
            toolName: request.toolName,
            input: request.toolInput,
            status: 'pending',
            onDecide: (approved: boolean, updatedInput?: Record<string, unknown>) =>
              handlePermissionDecision(request.key, request.toolUseID, approved, updatedInput)
          }
        ]
      }))
    })
  }, [])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  function refreshAgents(projectId: string, projectPath: string): void {
    window.agentstack.listAgents(projectPath).then((agents) => {
      setAgentsByProject((prev) => ({ ...prev, [projectId]: agents }))
    })
  }

  useEffect(() => {
    if (!selectedProject) return
    if (agentsByProject[selectedProject.id]) return
    refreshAgents(selectedProject.id, selectedProject.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, agentsByProject])

  useEffect(() => {
    if (!selectedProject) return
    if (permissionModeByProject[selectedProject.id]) return
    window.agentstack.getPermissionMode(selectedProject.id).then((mode) => {
      setPermissionModeByProject((prev) => ({ ...prev, [selectedProject.id]: mode }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, permissionModeByProject])

  async function handleSetPermissionMode(mode: PermissionMode): Promise<void> {
    if (!selectedProject) return
    await window.agentstack.setPermissionMode(selectedProject.id, mode)
    setPermissionModeByProject((prev) => ({ ...prev, [selectedProject.id]: mode }))
  }

  function refreshDeskLayout(projectId: string): void {
    window.agentstack.listDeskLayout(projectId).then((layout) => {
      setDeskLayoutByProject((prev) => ({ ...prev, [projectId]: layout }))
    })
  }

  useEffect(() => {
    if (!selectedProject) return
    if (deskLayoutByProject[selectedProject.id]) return
    refreshDeskLayout(selectedProject.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, deskLayoutByProject])

  async function handleUpdateAgent(filePath: string, input: NewAgentInput): Promise<void> {
    if (!selectedProject) return
    await window.agentstack.updateAgent(filePath, input)
    refreshAgents(selectedProject.id, selectedProject.path)
    setEditingAgent(null)
  }

  async function handleUpdateAppearance(
    agentName: string,
    suitColor?: string,
    deskColor?: string
  ): Promise<void> {
    if (!selectedProject) return
    const projectId = selectedProject.id
    await window.agentstack.setDeskAppearance(projectId, agentName, suitColor, deskColor)
    setDeskLayoutByProject((prev) => {
      const existing = prev[projectId] ?? []
      const idx = existing.findIndex((l) => l.agentName === agentName)
      const next =
        idx >= 0
          ? existing.map((l, i) => (i === idx ? { ...l, suitColor, deskColor } : l))
          : [...existing, { agentName, suitColor, deskColor }]
      return { ...prev, [projectId]: next }
    })
  }

  async function handleMoveDesk(agentName: string, x: number, y: number): Promise<void> {
    if (!selectedProject) return
    const projectId = selectedProject.id
    await window.agentstack.setDeskPosition(projectId, agentName, x, y)
    setDeskLayoutByProject((prev) => {
      const existing = prev[projectId] ?? []
      const idx = existing.findIndex((l) => l.agentName === agentName)
      const next =
        idx >= 0
          ? existing.map((l, i) => (i === idx ? { ...l, x, y } : l))
          : [...existing, { agentName, x, y }]
      return { ...prev, [projectId]: next }
    })
  }

  const agents = selectedProject ? (agentsByProject[selectedProject.id] ?? []) : []
  const selectedAgent = agents.find((a) => a.name === selectedAgentName) ?? null

  const activeKey =
    selectedProject && selectedAgentName ? sessionKey(selectedProject.id, selectedAgentName) : null

  // Desk status dots are scoped to the selected floor: map full session keys
  // back down to bare agent names for the grid.
  const floorStatuses = useMemo(() => {
    if (!selectedProject) return {}
    const prefix = `${selectedProject.id}::`
    const result: Record<string, string> = {}
    for (const [key, status] of Object.entries(statuses)) {
      if (key.startsWith(prefix)) result[key.slice(prefix.length)] = status
    }
    return result
  }, [statuses, selectedProject])

  const floorDelegations = useMemo(() => {
    if (!selectedProject) return []
    return orchestrationEvents.filter((e) => e.projectId === selectedProject.id)
  }, [orchestrationEvents, selectedProject])

  const floorCelebrating = useMemo(() => {
    if (!selectedProject) return []
    const prefix = `${selectedProject.id}::`
    return [...celebratingKeys]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
  }, [celebratingKeys, selectedProject])

  async function handleAddProject(): Promise<void> {
    const project = await window.agentstack.pickProject()
    if (project) {
      const list = await window.agentstack.listProjects()
      setProjects(list)
      setSelectedProjectId(project.id)
    }
  }

  async function handleRemoveProject(id: string): Promise<void> {
    await window.agentstack.removeProject(id)
    const list = await window.agentstack.listProjects()
    setProjects(list)
    if (selectedProjectId === id) {
      setSelectedProjectId(list[0]?.id ?? null)
      setSelectedAgentName(null)
    }
  }

  async function handleSelectAgent(agentName: string): Promise<void> {
    if (!selectedProject) return
    setSelectedAgentName(agentName)
    setRecentAgentNames((prev) => [agentName, ...prev.filter((n) => n !== agentName)].slice(0, 5))
    const key = sessionKey(selectedProject.id, agentName)
    const result = await window.agentstack.ensureSession(selectedProject.id, selectedProject.path, agentName)

    // Hydrate the chat log from the persisted transcript the first time we
    // resume a session that already had prior turns (per-agent memory).
    if (result.resumed && result.sessionId && !hydratedKeys[key]) {
      setHydratedKeys((prev) => ({ ...prev, [key]: true }))
      const history = await window.agentstack.loadHistory(selectedProject.path, result.sessionId)
      if (history.length > 0) {
        setChatLogs((prev) => ({
          ...prev,
          [key]: [...history.map((h) => historyChatItem(h.role, h.text)), ...(prev[key] ?? [])]
        }))
      }
    }
  }

  async function handleSend(text: string): Promise<void> {
    if (!selectedProject || !selectedAgentName || !activeKey) return
    setChatLogs((prev) => ({
      ...prev,
      [activeKey]: [...(prev[activeKey] ?? []), userChatItem(text)]
    }))
    await window.agentstack.sendPrompt(selectedProject.id, selectedAgentName, text)
  }

  async function handleClearSession(): Promise<void> {
    if (!selectedProject || !selectedAgentName || !activeKey) return
    await window.agentstack.clearSession(selectedProject.id, selectedAgentName)
    const key = activeKey
    setChatLogs((prev) => ({ ...prev, [key]: [] }))
    setStatuses((prev) => ({ ...prev, [key]: 'idle' }))
    setHydratedKeys((prev) => ({ ...prev, [key]: false }))
  }

  async function handleInterrupt(): Promise<void> {
    if (!selectedProject || !selectedAgentName) return
    await window.agentstack.interruptSession(selectedProject.id, selectedAgentName)
  }

  async function handleHandoff(targetAgentName: string, promptText: string): Promise<void> {
    if (!selectedProject) return
    const key = sessionKey(selectedProject.id, targetAgentName)
    try {
      await handleSelectAgent(targetAgentName)
      setChatLogs((prev) => ({
        ...prev,
        [key]: [...(prev[key] ?? []), userChatItem(promptText)]
      }))
      await window.agentstack.sendPrompt(selectedProject.id, targetAgentName, promptText)
    } catch (err) {
      // Surface handoff failures instead of letting the rejected promise vanish
      // silently — without this, a failed session:ensure/sendPrompt call left
      // the user staring at an empty chat with no indication anything went wrong.
      const message = err instanceof Error ? err.message : String(err)
      setChatLogs((prev) => ({
        ...prev,
        [key]: [
          ...(prev[key] ?? []),
          { kind: 'error', id: `handoff-error-${Date.now()}`, text: `Hand-off to ${targetAgentName} failed: ${message}` }
        ]
      }))
    }
  }

  async function handleCreateAgent(input: NewAgentInput): Promise<void> {
    if (!selectedProject) return
    await window.agentstack.createAgent(selectedProject.path, input)
    refreshAgents(selectedProject.id, selectedProject.path)
    setShowAddAgent(false)
  }

  function handleGenerateAgents(): void {
    if (!selectedProject) return
    setShowGenerateDialog(true)
  }

  async function handleCreateFromTemplates(templateIds: string[]): Promise<void> {
    if (!selectedProject) return
    const templates = AGENT_TEMPLATES.filter((t) => templateIds.includes(t.id))
    for (const t of templates) {
      await window.agentstack.createAgent(selectedProject.path, {
        name: t.name,
        description: t.description,
        model: t.model,
        color: t.color,
        icon: t.icon,
        department: t.department,
        previewUI: t.previewUI,
        isFloorManager: t.isFloorManager,
        systemPrompt: t.systemPrompt
      })
    }
    refreshAgents(selectedProject.id, selectedProject.path)
    setShowGenerateDialog(false)
  }

  return (
    <div className="app-shell">
      <div className="title-bar">
        <div className="title-bar-left">
          <span className="logo-mark">◆</span>
          <span>AgentStack</span>
        </div>
        <div className="view-mode-switch">
          <button
            className={`view-mode-tab ${viewMode === 'floor' ? 'active' : ''}`}
            onClick={() => setViewMode('floor')}
          >
            Floor
          </button>
          <button
            className={`view-mode-tab ${viewMode === 'files' ? 'active' : ''}`}
            onClick={() => setViewMode('files')}
            disabled={!selectedProject}
          >
            File Viewer
          </button>
        </div>
        <div className="title-bar-right">
          <QuotaBadge quota={quota} />
          {cliStatus && (
            <span className="status-badge">
              <span className={`status-dot ${cliStatus.available ? '' : 'status-dot-bad'}`} />
              {cliStatus.available ? 'Claude CLI ready' : 'Claude CLI not found'}
            </span>
          )}
          <button className="title-bar-icon">⚙</button>
          <button className="title-bar-icon">🔔</button>
          <span className="title-bar-avatar">A</span>
        </div>
      </div>

      {selectedProject && (
        <FileViewer
          key={selectedProject.id}
          projectPath={selectedProject.path}
          hidden={viewMode !== 'files'}
        />
      )}

      <div className={`office-body ${viewMode === 'files' ? 'view-hidden' : ''}`}>
        <DeskGrid
          project={selectedProject}
          projects={projects}
          agents={agents}
          statuses={floorStatuses}
          celebratingAgents={floorCelebrating}
          selectedAgent={selectedAgentName}
          onSelectProject={(id) => {
            setSelectedProjectId(id)
            setSelectedAgentName(null)
          }}
          onAddProject={handleAddProject}
          onRemoveProject={handleRemoveProject}
          onSelectAgent={handleSelectAgent}
          onAddAgent={() => setShowAddAgent(true)}
          onEditAgent={(agent) => setEditingAgent(agent)}
          layout={selectedProject ? (deskLayoutByProject[selectedProject.id] ?? []) : []}
          activeDelegations={floorDelegations}
          onMoveDesk={handleMoveDesk}
          onDeselectAgent={() => setSelectedAgentName(null)}
          onGenerateAgents={handleGenerateAgents}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          recentAgentNames={recentAgentNames}
          deptFilter={deptFilter}
          onToggleDept={(dept) => setDeptFilter((prev) => (prev === dept ? null : dept))}
          onShowAllDepartments={() => setDeptFilter(null)}
        />

        {selectedAgent && activeKey && selectedProject ? (
          <ChatPanel
            agent={selectedAgent}
            items={chatLogs[activeKey] ?? []}
            status={statuses[activeKey] ?? 'idle'}
            onSend={handleSend}
            permissionMode={permissionModeByProject[selectedProject.id] ?? 'confirm'}
            onChangePermissionMode={handleSetPermissionMode}
            agents={agents}
            onHandoff={handleHandoff}
            projectPath={selectedProject.path}
            onClearSession={handleClearSession}
            onInterrupt={handleInterrupt}
          />
        ) : (
          <div className="agent-chat-panel">
            <div className="chat-empty">
              <div className="chat-empty-icon">💬</div>
              <div>Select an agent on the floor to see their status and start a conversation.</div>
            </div>
          </div>
        )}
      </div>

      {selectedProject && (
        <TerminalPanel
          key={selectedProject.id}
          projectId={selectedProject.id}
          projectPath={selectedProject.path}
          collapsed={terminalCollapsed}
          onToggleCollapsed={() => setTerminalCollapsed((prev) => !prev)}
        />
      )}

      {showAddAgent && (
        <AddAgentDialog onCancel={() => setShowAddAgent(false)} onCreate={handleCreateAgent} />
      )}

      {editingAgent && selectedProject && (
        <EditAgentDialog
          agent={editingAgent}
          projectPath={selectedProject.path}
          layout={
            (deskLayoutByProject[selectedProject.id] ?? []).find(
              (l) => l.agentName === editingAgent.name
            ) ?? { agentName: editingAgent.name }
          }
          onCancel={() => setEditingAgent(null)}
          onSaveAgent={handleUpdateAgent}
          onSaveAppearance={handleUpdateAppearance}
        />
      )}

      {showGenerateDialog && selectedProject && (
        <GenerateAgentsDialog
          projectName={selectedProject.name}
          existingNames={agents.map((a) => a.name)}
          onClose={() => setShowGenerateDialog(false)}
          onCreate={handleCreateFromTemplates}
        />
      )}
    </div>
  )
}
