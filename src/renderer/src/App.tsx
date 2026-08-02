import { useEffect, useMemo, useState } from 'react'
import type {
  AgentGroup,
  AgentInfo,
  ClaudeCliStatus,
  DeskLayout,
  NewAgentInput,
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
import NameGroupDialog from './components/NameGroupDialog'
import QuotaBadge from './components/QuotaBadge'
import { toChatItems, userChatItem, type ChatItem } from './chatItems'

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
  const [generateProjectId, setGenerateProjectId] = useState<string | null>(null)
  const [generateItems, setGenerateItems] = useState<ChatItem[]>([])
  const [generating, setGenerating] = useState(false)
  const [groupsByProject, setGroupsByProject] = useState<Record<string, AgentGroup[]>>({})
  const [picking, setPicking] = useState(false)
  const [pickedAgents, setPickedAgents] = useState<string[]>([])
  const [showNameGroup, setShowNameGroup] = useState(false)
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
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

  useEffect(() => {
    return window.agentstack.onSessionEvent((event) => {
      setStatuses((prev) => ({ ...prev, [event.key]: event.status }))
      const newItems = toChatItems(event)
      if (newItems.length === 0) return
      setChatLogs((prev) => ({ ...prev, [event.key]: [...(prev[event.key] ?? []), ...newItems] }))
    })
  }, [])

  function handlePermissionDecision(key: string, toolUseID: string, approved: boolean): void {
    window.agentstack.respondToPermission(toolUseID, approved)
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
            onDecide: (approved: boolean) =>
              handlePermissionDecision(request.key, request.toolUseID, approved)
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
    if (!generateProjectId) return
    const key = `generate::${generateProjectId}`

    const offEvent = window.agentstack.onGenerateEvent((event) => {
      if (event.key !== key) return
      const newItems = toChatItems(event)
      if (newItems.length > 0) setGenerateItems((prev) => [...prev, ...newItems])
    })
    const offDone = window.agentstack.onGenerateDone((payload) => {
      if (payload.key !== key) return
      setGenerating(false)
      const project = projects.find((p) => p.id === generateProjectId)
      if (project) refreshAgents(project.id, project.path)
    })
    return () => {
      offEvent()
      offDone()
    }
  }, [generateProjectId, projects])

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

  function refreshGroups(projectId: string): void {
    window.agentstack.listGroups(projectId).then((groups) => {
      setGroupsByProject((prev) => ({ ...prev, [projectId]: groups }))
    })
  }

  useEffect(() => {
    if (!selectedProject) return
    if (groupsByProject[selectedProject.id]) return
    refreshGroups(selectedProject.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, groupsByProject])

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

  function handleMoveDesk(agentName: string, x: number, y: number): void {
    if (!selectedProject) return
    const projectId = selectedProject.id
    window.agentstack.setDeskPosition(projectId, agentName, x, y)
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

  async function handleCreateAgent(input: NewAgentInput): Promise<void> {
    if (!selectedProject) return
    await window.agentstack.createAgent(selectedProject.path, input)
    refreshAgents(selectedProject.id, selectedProject.path)
    setShowAddAgent(false)
  }

  function handleGenerateAgents(): void {
    if (!selectedProject) return
    setGenerateProjectId(selectedProject.id)
    setGenerateItems([])
    setGenerating(true)
    setShowGenerateDialog(true)
    window.agentstack.generateAgents(selectedProject.id, selectedProject.path)
  }

  function handleTogglePicking(): void {
    setPicking((prev) => !prev)
    setPickedAgents([])
  }

  function handleTogglePick(agentName: string): void {
    setPickedAgents((prev) =>
      prev.includes(agentName) ? prev.filter((n) => n !== agentName) : [...prev, agentName]
    )
  }

  async function handleConfirmGroup(name: string): Promise<void> {
    if (!selectedProject) return
    await window.agentstack.createGroup(selectedProject.id, name, pickedAgents)
    refreshGroups(selectedProject.id)
    setShowNameGroup(false)
    setPicking(false)
    setPickedAgents([])
  }

  async function handleDeleteGroup(groupId: string): Promise<void> {
    if (!selectedProject) return
    await window.agentstack.deleteGroup(groupId)
    refreshGroups(selectedProject.id)
  }

  const groups = selectedProject ? (groupsByProject[selectedProject.id] ?? []) : []

  return (
    <div className="app-shell">
      <div className="title-bar">
        <div className="title-bar-left">
          <span className="logo-mark">◆</span>
          <span>AgentStack</span>
        </div>
        <div className="title-bar-center">
          <input className="search-input" type="text" placeholder="Search projects, agents..." />
        </div>
        <div className="title-bar-right">
          <QuotaBadge quota={quota} />
          {cliStatus && (
            <span className="status-badge">
              <span className={`status-dot ${cliStatus.available ? '' : 'status-dot-bad'}`} />
              {cliStatus.available ? 'Claude CLI ready' : 'Claude CLI not found'}
            </span>
          )}
          <span className="title-bar-icon">⚙</span>
          <span className="title-bar-icon">🔔</span>
          <span className="title-bar-avatar">A</span>
        </div>
      </div>

      <div className="office-body">
        <DeskGrid
          project={selectedProject}
          projects={projects}
          agents={agents}
          statuses={floorStatuses}
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
          onMoveDesk={handleMoveDesk}
          onGenerateAgents={handleGenerateAgents}
          generating={generating && generateProjectId === selectedProject?.id}
          groups={groups}
          picking={picking}
          pickedAgents={pickedAgents}
          onTogglePicking={handleTogglePicking}
          onTogglePick={handleTogglePick}
          onCreateGroup={() => setShowNameGroup(true)}
          onDeleteGroup={handleDeleteGroup}
        />

        {selectedAgent && activeKey && selectedProject ? (
          <ChatPanel
            agent={selectedAgent}
            items={chatLogs[activeKey] ?? []}
            status={statuses[activeKey] ?? 'idle'}
            onSend={handleSend}
            permissionMode={permissionModeByProject[selectedProject.id] ?? 'confirm'}
            onChangePermissionMode={handleSetPermissionMode}
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

      {showGenerateDialog && (
        <GenerateAgentsDialog
          projectName={projects.find((p) => p.id === generateProjectId)?.name ?? ''}
          items={generateItems}
          running={generating}
          onClose={() => setShowGenerateDialog(false)}
        />
      )}

      {showNameGroup && (
        <NameGroupDialog
          count={pickedAgents.length}
          onCancel={() => setShowNameGroup(false)}
          onConfirm={handleConfirmGroup}
        />
      )}
    </div>
  )
}
