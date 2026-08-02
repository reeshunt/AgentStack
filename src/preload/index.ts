import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentGroup,
  AgentInfo,
  ClaudeCliStatus,
  GenerateEvent,
  NewAgentInput,
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

  onSessionEvent: (callback: (event: SessionEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: SessionEvent): void =>
      callback(payload)
    ipcRenderer.on('session:event', listener)
    return () => ipcRenderer.removeListener('session:event', listener)
  },

  generateAgents: (projectId: string, projectPath: string): Promise<void> =>
    ipcRenderer.invoke('agents:generate', { projectId, projectPath }),

  onGenerateEvent: (callback: (event: GenerateEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: GenerateEvent): void =>
      callback(payload)
    ipcRenderer.on('generate:event', listener)
    return () => ipcRenderer.removeListener('generate:event', listener)
  },

  onGenerateDone: (callback: (payload: { key: string }) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { key: string }): void =>
      callback(payload)
    ipcRenderer.on('generate:done', listener)
    return () => ipcRenderer.removeListener('generate:done', listener)
  },

  listGroups: (projectId: string): Promise<AgentGroup[]> => ipcRenderer.invoke('groups:list', projectId),

  createGroup: (projectId: string, name: string, agentNames: string[]): Promise<AgentGroup> =>
    ipcRenderer.invoke('groups:create', { projectId, name, agentNames }),

  deleteGroup: (groupId: string): Promise<void> => ipcRenderer.invoke('groups:delete', groupId),

  onQuotaUpdate: (callback: (info: QuotaInfo) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: QuotaInfo): void => callback(payload)
    ipcRenderer.on('quota:update', listener)
    return () => ipcRenderer.removeListener('quota:update', listener)
  },

  getPermissionMode: (projectId: string): Promise<PermissionMode> =>
    ipcRenderer.invoke('settings:getPermissionMode', projectId),

  setPermissionMode: (projectId: string, mode: PermissionMode): Promise<void> =>
    ipcRenderer.invoke('settings:setPermissionMode', { projectId, mode }),

  respondToPermission: (toolUseID: string, approved: boolean, reason?: string): Promise<void> =>
    ipcRenderer.invoke('session:permission_response', { toolUseID, approved, reason }),

  onPermissionRequest: (callback: (request: PermissionRequest) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: PermissionRequest): void =>
      callback(payload)
    ipcRenderer.on('session:permission_request', listener)
    return () => ipcRenderer.removeListener('session:permission_request', listener)
  }
}

export type AgentStackApi = typeof api

contextBridge.exposeInMainWorld('agentstack', api)
