import { db } from './db'

/** Looks up the persisted Agent SDK session_id for a given (project, agent) pair. */
export function getSavedSessionId(key: string): string | undefined {
  const row = db.prepare('SELECT session_id FROM agent_sessions WHERE key = ?').get(key) as
    | { session_id: string }
    | undefined
  return row?.session_id
}

/** Remembers which SDK session_id backs a (project, agent) pair, so it can be resumed later. */
export function saveSessionId(key: string, sessionId: string): void {
  db.prepare(
    `INSERT INTO agent_sessions (key, session_id, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`
  ).run(key, sessionId, Date.now())
}
