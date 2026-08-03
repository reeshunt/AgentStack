import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { addProject, listProjects, removeProject } from './projectRegistry'
import { createAgent, listAgents, readAgentPrompt, updateAgent } from './agents'
import { listDeskLayout, setDeskAppearance, setDeskPosition } from './deskLayout'
import { checkClaudeCli } from './claudeCli'
import {
  ensureSession,
  getSession,
  interruptSession,
  loadHistory,
  resetSession,
  sendPrompt
} from './sessions'
import { answerPermission } from './permissions'
import { getPermissionMode, setPermissionMode } from './settings'
import { deleteMockup, listMockups, saveMockup } from './mockups'
import { ensureTerminal, killAllTerminals, killTerminal, resizeTerminal, writeTerminal } from './terminal'
import { listDirectory, readFileContents, renamePath, writeFileContents } from './fileExplorer'
import {
  buildDelegationBriefing,
  buildDelegationMcpServer,
  FLOOR_MANAGER_DISALLOWED_TOOLS
} from './orchestration'
import type { MockupScreen, NewAgentInput, PermissionMode } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('projects:list', () => listProjects())

  ipcMain.handle('projects:pick', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return addProject(result.filePaths[0])
  })

  ipcMain.handle('projects:remove', (_e, id: string) => removeProject(id))

  ipcMain.handle('agents:list', (_e, projectPath: string) => listAgents(projectPath))

  ipcMain.handle(
    'agents:create',
    (_e, args: { projectPath: string; input: NewAgentInput }) =>
      createAgent(args.projectPath, args.input)
  )

  ipcMain.handle(
    'agents:update',
    (_e, args: { filePath: string; input: NewAgentInput }) =>
      updateAgent(args.filePath, args.input)
  )

  ipcMain.handle(
    'agents:readPrompt',
    (_e, args: { projectPath: string; agentName: string }) =>
      readAgentPrompt(args.projectPath, args.agentName)
  )

  ipcMain.handle('deskLayout:list', (_e, projectId: string) => listDeskLayout(projectId))

  ipcMain.handle(
    'deskLayout:setAppearance',
    (_e, args: { projectId: string; agentName: string; suitColor?: string; deskColor?: string }) =>
      setDeskAppearance(args.projectId, args.agentName, args.suitColor, args.deskColor)
  )

  ipcMain.handle(
    'deskLayout:setPosition',
    (_e, args: { projectId: string; agentName: string; x: number; y: number }) =>
      setDeskPosition(args.projectId, args.agentName, args.x, args.y)
  )

  ipcMain.handle('claude:cliStatus', () => checkClaudeCli())

  ipcMain.handle(
    'session:ensure',
    async (_e, args: { projectId: string; projectPath: string; agentName: string }) => {
      if (!mainWindow) throw new Error('No window')

      // Only the Floor Manager's session gets the delegate_task tool + delegation
      // briefing — everyone else starts exactly as before.
      const roster = await listAgents(args.projectPath)
      const agent = roster.find((a) => a.name === args.agentName)
      const extraMcpServers = agent?.isFloorManager
        ? buildDelegationMcpServer(args.projectId, args.projectPath, args.agentName, mainWindow)
        : undefined
      const extraSystemPromptSuffix = agent?.isFloorManager
        ? buildDelegationBriefing(roster.filter((a) => a.name !== args.agentName))
        : undefined
      const extraDisallowedTools = agent?.isFloorManager ? FLOOR_MANAGER_DISALLOWED_TOOLS : undefined

      const state = await ensureSession(
        args.projectId,
        args.projectPath,
        args.agentName,
        mainWindow,
        extraMcpServers,
        extraSystemPromptSuffix,
        extraDisallowedTools
      )
      return { key: state.key, status: state.status, resumed: state.resumed, sessionId: state.sessionId }
    }
  )

  ipcMain.handle(
    'session:history',
    (_e, args: { projectPath: string; sessionId: string }) =>
      loadHistory(args.projectPath, args.sessionId)
  )

  ipcMain.handle(
    'session:prompt',
    (_e, args: { projectId: string; agentName: string; text: string }) => {
      const state = getSession(args.projectId, args.agentName)
      if (!state) throw new Error('Session not started')
      sendPrompt(state, args.text)
    }
  )

  ipcMain.handle('session:interrupt', async (_e, args: { projectId: string; agentName: string }) => {
    const state = getSession(args.projectId, args.agentName)
    if (!state) return
    await interruptSession(state)
  })

  ipcMain.handle('session:clear', (_e, args: { projectId: string; agentName: string }) =>
    resetSession(args.projectId, args.agentName)
  )

  ipcMain.handle('settings:getPermissionMode', (_e, projectId: string) =>
    getPermissionMode(projectId)
  )

  ipcMain.handle(
    'settings:setPermissionMode',
    (_e, args: { projectId: string; mode: PermissionMode }) =>
      setPermissionMode(args.projectId, args.mode)
  )

  ipcMain.handle(
    'session:permission_response',
    (
      _e,
      args: {
        toolUseID: string
        approved: boolean
        reason?: string
        updatedInput?: Record<string, unknown>
      }
    ) => answerPermission(args.toolUseID, args.approved, args.reason, args.updatedInput)
  )

  ipcMain.handle(
    'mockups:list',
    (_e, args: { projectPath: string; agentName: string }) =>
      listMockups(args.projectPath, args.agentName)
  )

  ipcMain.handle(
    'mockups:save',
    (
      _e,
      args: {
        projectPath: string
        agentName: string
        screen: { title: string; lang: MockupScreen['lang']; code: string }
      }
    ) => saveMockup(args.projectPath, args.agentName, args.screen)
  )

  ipcMain.handle(
    'mockups:delete',
    (_e, args: { projectPath: string; agentName: string; screenId: string }) =>
      deleteMockup(args.projectPath, args.agentName, args.screenId)
  )

  ipcMain.handle(
    'terminal:start',
    (_e, args: { projectId: string; projectPath: string; cols: number; rows: number }) => {
      if (!mainWindow) throw new Error('No window')
      return ensureTerminal(args.projectId, args.projectPath, args.cols, args.rows, mainWindow)
    }
  )

  ipcMain.handle('terminal:input', (_e, args: { projectId: string; data: string }) =>
    writeTerminal(args.projectId, args.data)
  )

  ipcMain.handle(
    'terminal:resize',
    (_e, args: { projectId: string; cols: number; rows: number }) =>
      resizeTerminal(args.projectId, args.cols, args.rows)
  )

  ipcMain.handle('terminal:kill', (_e, projectId: string) => killTerminal(projectId))

  ipcMain.handle('files:list', (_e, args: { projectPath: string; dirPath: string }) =>
    listDirectory(args.projectPath, args.dirPath)
  )

  ipcMain.handle('files:read', (_e, args: { projectPath: string; filePath: string }) =>
    readFileContents(args.projectPath, args.filePath)
  )

  ipcMain.handle(
    'files:write',
    (_e, args: { projectPath: string; filePath: string; content: string }) =>
      writeFileContents(args.projectPath, args.filePath, args.content)
  )

  ipcMain.handle(
    'files:rename',
    (_e, args: { projectPath: string; filePath: string; newName: string }) =>
      renamePath(args.projectPath, args.filePath, args.newName)
  )
}

app.whenReady().then(() => {
  // Speech-to-text in the chat input uses the Web Speech API, which needs
  // microphone access; Electron denies media permission requests by default.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllTerminals()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => killAllTerminals())
