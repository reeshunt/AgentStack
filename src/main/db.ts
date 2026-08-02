import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const CONFIG_DIR = join(homedir(), '.agentstack')
const DB_PATH = join(CONFIG_DIR, 'agentstack.db')
const LEGACY_PROJECTS_FILE = join(CONFIG_DIR, 'projects.json')
const LEGACY_SESSIONS_FILE = join(CONFIG_DIR, 'sessions.json')

if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })

export const db: Database.Database = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    added_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_sessions (
    key TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_groups (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_group_members (
    group_id TEXT NOT NULL REFERENCES agent_groups(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    PRIMARY KEY (group_id, agent_name)
  );

  CREATE TABLE IF NOT EXISTS desk_layout (
    project_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    x REAL,
    y REAL,
    suit_color TEXT,
    desk_color TEXT,
    PRIMARY KEY (project_id, agent_name)
  );
`)

migrateLegacyJsonStores()

/**
 * One-time import of the pre-SQLite ~/.agentstack/*.json stores (projects,
 * per-agent session ids) so upgrading doesn't lose a user's existing setup.
 * Runs only while the corresponding table is still empty.
 */
function migrateLegacyJsonStores(): void {
  const projectCount = (db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }).n
  if (projectCount === 0 && existsSync(LEGACY_PROJECTS_FILE)) {
    try {
      const legacy = JSON.parse(readFileSync(LEGACY_PROJECTS_FILE, 'utf-8')) as Array<{
        id: string
        name: string
        path: string
        addedAt: number
      }>
      const insert = db.prepare(
        'INSERT OR IGNORE INTO projects (id, name, path, added_at) VALUES (?, ?, ?, ?)'
      )
      const insertAll = db.transaction((rows: typeof legacy) => {
        for (const row of rows) insert.run(row.id, row.name, row.path, row.addedAt)
      })
      if (Array.isArray(legacy)) insertAll(legacy)
    } catch {
      // Corrupt legacy file — ignore and start fresh in SQLite.
    }
  }

  const sessionCount = (
    db.prepare('SELECT COUNT(*) AS n FROM agent_sessions').get() as { n: number }
  ).n
  if (sessionCount === 0 && existsSync(LEGACY_SESSIONS_FILE)) {
    try {
      const legacy = JSON.parse(readFileSync(LEGACY_SESSIONS_FILE, 'utf-8')) as Record<
        string,
        string
      >
      const insert = db.prepare(
        'INSERT OR IGNORE INTO agent_sessions (key, session_id, updated_at) VALUES (?, ?, ?)'
      )
      const insertAll = db.transaction((entries: Array<[string, string]>) => {
        for (const [key, sessionId] of entries) insert.run(key, sessionId, Date.now())
      })
      if (legacy && typeof legacy === 'object') insertAll(Object.entries(legacy))
    } catch {
      // Corrupt legacy file — ignore and start fresh in SQLite.
    }
  }
}
