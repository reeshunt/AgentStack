import { randomUUID } from 'node:crypto'
import { db } from './db'
import type { AgentGroup } from '../shared/types'

type GroupRow = { id: string; project_id: string; name: string; created_at: number }

export function listGroups(projectId: string): AgentGroup[] {
  const groups = db
    .prepare('SELECT * FROM agent_groups WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId) as GroupRow[]

  const memberStmt = db.prepare(
    'SELECT agent_name FROM agent_group_members WHERE group_id = ? ORDER BY agent_name ASC'
  )

  return groups.map((g) => ({
    id: g.id,
    projectId: g.project_id,
    name: g.name,
    agentNames: (memberStmt.all(g.id) as Array<{ agent_name: string }>).map((r) => r.agent_name)
  }))
}

export function createGroup(projectId: string, name: string, agentNames: string[]): AgentGroup {
  const id = randomUUID()
  const createdAt = Date.now()

  const insertGroup = db.prepare(
    'INSERT INTO agent_groups (id, project_id, name, created_at) VALUES (?, ?, ?, ?)'
  )
  const insertMember = db.prepare(
    'INSERT OR IGNORE INTO agent_group_members (group_id, agent_name) VALUES (?, ?)'
  )

  const run = db.transaction(() => {
    insertGroup.run(id, projectId, name, createdAt)
    for (const agentName of agentNames) insertMember.run(id, agentName)
  })
  run()

  return { id, projectId, name, agentNames: [...agentNames].sort() }
}

export function deleteGroup(groupId: string): void {
  db.prepare('DELETE FROM agent_groups WHERE id = ?').run(groupId)
}
