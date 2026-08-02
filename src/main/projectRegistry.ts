import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { db } from './db'
import type { Project } from '../shared/types'

type ProjectRow = { id: string; name: string; path: string; added_at: number }

function fromRow(row: ProjectRow): Project {
  return { id: row.id, name: row.name, path: row.path, addedAt: row.added_at }
}

export function listProjects(): Project[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY added_at ASC').all() as ProjectRow[]
  return rows.map(fromRow)
}

export function addProject(path: string): Project {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`Not a directory: ${path}`)
  }

  const existing = db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as
    | ProjectRow
    | undefined
  if (existing) return fromRow(existing)

  const project: Project = {
    id: randomUUID(),
    name: path.split('/').filter(Boolean).pop() ?? path,
    path,
    addedAt: Date.now()
  }
  db.prepare('INSERT INTO projects (id, name, path, added_at) VALUES (?, ?, ?, ?)').run(
    project.id,
    project.name,
    project.path,
    project.addedAt
  )
  return project
}

export function removeProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}
