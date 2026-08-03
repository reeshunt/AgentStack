import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentInfo,
  ClaudeCliStatus,
  DeskLayout,
  FileEntry,
  MockupScreen,
  NewAgentInput,
  OrchestrationEvent,
  PermissionMode,
  PermissionRequest,
  Project,
  QuotaInfo,
  SessionEvent
} from '../shared/types'

const api = {
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
  pickProject: (): Promise<Project | null> => ipcRenderer.invoke('projects:pick'),
  removeProject: (id: string): Promise<void> => ipcRenderer.invoke('projects:remove', id),

  listAgents: (projectPath: string): Promise<AgentInfo[]> =>
    ipcRenderer.invoke('agents:list', projectPath),

  createAgent: (projectPath: string, input: NewAgentInput): Promise<AgentInfo> =>
    ipcRenderer.invoke('agents:create', { projectPath, input }),

  updateAgent: (filePath: string, input: NewAgentInput): Promise<AgentInfo> =>
    ipcRenderer.invoke('agents:update', { filePath, input }),

  readAgentPrompt: (
    projectPath: string,
    agentName: string
  ): Promise<{ systemPrompt: string; tools?: string[] } | undefined> =>
    ipcRenderer.invoke('agents:readPrompt', { projectPath, agentName }),

  listDeskLayout: (projectId: string): Promise<DeskLayout[]> =>
    ipcRenderer.invoke('deskLayout:list', projectId),

  setDeskAppearance: (
    projectId: string,
    agentName: string,
    suitColor?: string,
    deskColor?: string
  ): Promise<void> =>
    ipcRenderer.invoke('deskLayout:setAppearance', { projectId, agentName, suitColor, deskColor }),

  setDeskPosition: (projectId: string, agentName: string, x: number, y: number): Promise<void> =>
    ipcRenderer.invoke('deskLayout:setPosition', { projectId, agentName, x, y }),

  claudeCliStatus: (): Promise<ClaudeCliStatus> => ipcRenderer.invoke('claude:cliStatus'),

  ensureSession: (
    projectId: string,
    projectPath: string,
    agentName: string
  ): Promise<{ key: string; status: string; resumed: boolean; sessionId?: string }> =>
    ipcRenderer.invoke('session:ensure', { projectId, projectPath, agentName }),

  loadHistory: (
    projectPath: string,
    sessionId: string
  ): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> =>
    ipcRenderer.invoke('session:history', { projectPath, sessionId }),

  sendPrompt: (projectId: string, agentName: string, text: string): Promise<void> =>
    ipcRenderer.invoke('session:prompt', { projectId, agentName, text }),

  interruptSession: (projectId: string, agentName: string): Promise<void> =>
    ipcRenderer.invoke('session:interrupt', { projectId, agentName }),

  clearSession: (projectId: string, agentName: string): Promise<void> =>
    ipcRenderer.invoke('session:clear', { projectId, agentName }),

  onSessionEvent: (callback: (event: SessionEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: SessionEvent): void =>
      callback(payload)
    ipcRenderer.on('session:event', listener)
    return () => ipcRenderer.removeListener('session:event', listener)
  },

  onQuotaUpdate: (callback: (info: QuotaInfo) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: QuotaInfo): void => callback(payload)
    ipcRenderer.on('quota:update', listener)
    return () => ipcRenderer.removeListener('quota:update', listener)
  },

  getPermissionMode: (projectId: string): Promise<PermissionMode> =>
    ipcRenderer.invoke('settings:getPermissionMode', projectId),

  setPermissionMode: (projectId: string, mode: PermissionMode): Promise<void> =>
    ipcRenderer.invoke('settings:setPermissionMode', { projectId, mode }),

  respondToPermission: (
    toolUseID: string,
    approved: boolean,
    reason?: string,
    updatedInput?: Record<string, unknown>
  ): Promise<void> =>
    ipcRenderer.invoke('session:permission_response', { toolUseID, approved, reason, updatedInput }),

  onPermissionRequest: (callback: (request: PermissionRequest) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: PermissionRequest): void =>
      callback(payload)
    ipcRenderer.on('session:permission_request', listener)
    return () => ipcRenderer.removeListener('session:permission_request', listener)
  },

  listMockups: (projectPath: string, agentName: string): Promise<MockupScreen[]> =>
    ipcRenderer.invoke('mockups:list', { projectPath, agentName }),

  saveMockup: (
    projectPath: string,
    agentName: string,
    screen: { title: string; lang: MockupScreen['lang']; code: string }
  ): Promise<MockupScreen> => ipcRenderer.invoke('mockups:save', { projectPath, agentName, screen }),

  deleteMockup: (projectPath: string, agentName: string, screenId: string): Promise<void> =>
    ipcRenderer.invoke('mockups:delete', { projectPath, agentName, screenId }),

  startTerminal: (
    projectId: string,
    projectPath: string,
    cols: number,
    rows: number
  ): Promise<{ started: boolean }> =>
    ipcRenderer.invoke('terminal:start', { projectId, projectPath, cols, rows }),

  writeTerminal: (projectId: string, data: string): Promise<void> =>
    ipcRenderer.invoke('terminal:input', { projectId, data }),

  resizeTerminal: (projectId: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('terminal:resize', { projectId, cols, rows }),

  killTerminal: (projectId: string): Promise<void> => ipcRenderer.invoke('terminal:kill', projectId),

  onTerminalData: (callback: (payload: { projectId: string; data: string }) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { projectId: string; data: string }): void =>
      callback(payload)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },

  onTerminalExit: (callback: (payload: { projectId: string }) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { projectId: string }): void =>
      callback(payload)
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  },

  onOrchestrationEvent: (callback: (event: OrchestrationEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: OrchestrationEvent): void =>
      callback(payload)
    ipcRenderer.on('orchestration:event', listener)
    return () => ipcRenderer.removeListener('orchestration:event', listener)
  },

  listDirectory: (projectPath: string, dirPath: string): Promise<FileEntry[]> =>
    ipcRenderer.invoke('files:list', { projectPath, dirPath }),

  readFile: (
    projectPath: string,
    filePath: string
  ): Promise<{ content: string; binary: boolean; truncated: boolean }> =>
    ipcRenderer.invoke('files:read', { projectPath, filePath }),

  writeFile: (projectPath: string, filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('files:write', { projectPath, filePath, content }),

  renamePath: (projectPath: string, filePath: string, newName: string): Promise<FileEntry> =>
    ipcRenderer.invoke('files:rename', { projectPath, filePath, newName })
}

export type AgentStackApi = typeof api

contextBridge.exposeInMainWorld('agentstack', api)
