import { db } from './db'
import type { DeskLayout } from '../shared/types'

type Row = {
  project_id: string
  agent_name: string
  x: number | null
  y: number | null
  suit_color: string | null
  desk_color: string | null
}

function rowToLayout(row: Row): DeskLayout {
  return {
    agentName: row.agent_name,
    suitColor: row.suit_color ?? undefined,
    deskColor: row.desk_color ?? undefined,
    x: row.x ?? undefined,
    y: row.y ?? undefined
  }
}

export function listDeskLayout(projectId: string): DeskLayout[] {
  const rows = db
    .prepare('SELECT * FROM desk_layout WHERE project_id = ?')
    .all(projectId) as Row[]
  return rows.map(rowToLayout)
}

function upsert(projectId: string, agentName: string, fields: Partial<Row>): void {
  db.prepare(
    `INSERT INTO desk_layout (project_id, agent_name, x, y, suit_color, desk_color)
     VALUES (@project_id, @agent_name, @x, @y, @suit_color, @desk_color)
     ON CONFLICT (project_id, agent_name) DO UPDATE SET
       x = COALESCE(@x, x),
       y = COALESCE(@y, y),
       suit_color = COALESCE(@suit_color, suit_color),
       desk_color = COALESCE(@desk_color, desk_color)`
  ).run({
    project_id: projectId,
    agent_name: agentName,
    x: fields.x ?? null,
    y: fields.y ?? null,
    suit_color: fields.suit_color ?? null,
    desk_color: fields.desk_color ?? null
  })
}

export function setDeskAppearance(
  projectId: string,
  agentName: string,
  suitColor?: string,
  deskColor?: string
): void {
  upsert(projectId, agentName, { suit_color: suitColor, desk_color: deskColor })
}

export function setDeskPosition(projectId: string, agentName: string, x: number, y: number): void {
  upsert(projectId, agentName, { x, y })
}
