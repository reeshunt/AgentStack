import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import type { FileEntry } from '../shared/types'

const IGNORED_DIRS = new Set(['node_modules', '.git', '.DS_Store'])

/** Any project-relative path we're handed must resolve inside the project root —
 *  otherwise a compromised renderer (or a typo) could read/write/rename arbitrary
 *  files on disk via these IPC handlers. */
function resolveWithinProject(projectPath: string, targetPath: string): string {
  const resolved = isAbsolute(targetPath) ? targetPath : join(projectPath, targetPath)
  const rel = relative(projectPath, resolved)
  if (rel === '..' || rel.startsWith(`..${'/'}`) || isAbsolute(rel)) {
    throw new Error('Path is outside the project directory')
  }
  return resolved
}

export async function listDirectory(projectPath: string, dirPath: string): Promise<FileEntry[]> {
  const target = resolveWithinProject(projectPath, dirPath)
  const entries = await readdir(target, { withFileTypes: true })

  const result: FileEntry[] = []
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const fullPath = join(target, entry.name)
    const isDirectory = entry.isDirectory()
    let size = 0
    if (!isDirectory) {
      try {
        size = (await stat(fullPath)).size
      } catch {
        // Broken symlink or race with an external delete — skip the size, keep the entry.
      }
    }
    result.push({ name: entry.name, path: fullPath, isDirectory, size })
  }

  result.sort((a, b) =>
    a.isDirectory !== b.isDirectory ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name)
  )
  return result
}

const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8000)
  for (const byte of sample) {
    if (byte === 0) return true
  }
  return false
}

export async function readFileContents(
  projectPath: string,
  filePath: string
): Promise<{ content: string; binary: boolean; truncated: boolean }> {
  const target = resolveWithinProject(projectPath, filePath)
  const info = await stat(target)
  const buffer = await readFile(target)

  if (looksBinary(buffer)) {
    return { content: '', binary: true, truncated: false }
  }

  const truncated = info.size > MAX_TEXT_FILE_BYTES
  const content = truncated
    ? buffer.subarray(0, MAX_TEXT_FILE_BYTES).toString('utf-8')
    : buffer.toString('utf-8')
  return { content, binary: false, truncated }
}

export async function writeFileContents(
  projectPath: string,
  filePath: string,
  content: string
): Promise<void> {
  const target = resolveWithinProject(projectPath, filePath)
  await writeFile(target, content, 'utf-8')
}

export async function renamePath(
  projectPath: string,
  fromPath: string,
  newName: string
): Promise<FileEntry> {
  const from = resolveWithinProject(projectPath, fromPath)
  const dir = join(from, '..')
  const to = resolveWithinProject(projectPath, join(dir, newName))
  await rename(from, to)
  const isDirectory = (await stat(to)).isDirectory()
  const size = isDirectory ? 0 : (await stat(to)).size
  return { name: newName, path: to, isDirectory, size }
}
