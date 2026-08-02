import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { addProject, listProjects, removeProject } from './projectRegistry'
import { createAgent, listAgents } from './agents'
import { checkClaudeCli } from './claudeCli'
import { ensureSession, getSession, interruptSession, loadHistory, sendPrompt } from './sessions'
import { generateAgents } from './agentGenerator'
import { createGroup, deleteGroup, listGroups } from './groups'
import { answerPermission } from './permissions'
import { getPermissionMode, setPermissionMode } from './settings'
import type { NewAgentInput, PermissionMode } from '../shared/types'

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

  ipcMain.handle('claude:cliStatus', () => checkClaudeCli())

  ipcMain.handle(
    'session:ensure',
    async (_e, args: { projectId: string; projectPath: string; agentName: string }) => {
      if (!mainWindow) throw new Error('No window')
      const state = await ensureSession(args.projectId, args.projectPath, args.agentName, mainWindow)
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

  ipcMain.handle('agents:generate', (_e, args: { projectId: string; projectPath: string }) => {
    if (!mainWindow) throw new Error('No window')
    generateAgents(args.projectId, args.projectPath, mainWindow)
  })

  ipcMain.handle('groups:list', (_e, projectId: string) => listGroups(projectId))

  ipcMain.handle(
    'groups:create',
    (_e, args: { projectId: string; name: string; agentNames: string[] }) =>
      createGroup(args.projectId, args.name, args.agentNames)
  )

  ipcMain.handle('groups:delete', (_e, groupId: string) => deleteGroup(groupId))

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
    (_e, args: { toolUseID: string; approved: boolean; reason?: string }) =>
      answerPermission(args.toolUseID, args.approved, args.reason)
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
  if (process.platform !== 'darwin') app.quit()
})
