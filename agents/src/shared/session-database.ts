import { Database } from "bun:sqlite"

import { tokenizeQuery } from "./agent-utils.ts"
import type { AgentMessage, MemoryHit, ProfileId } from "./types.ts"

export function initializeDatabase(path: string): Database {
  const db = new Database(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
      profile_id,
      session_id,
      user_id,
      role,
      content
    )
  `)
  return db
}

export function loadSessionMessages(db: Database, profileId: ProfileId, sessionId: string, userId: string): AgentMessage[] {
  const query = db.query<
    {
      role: AgentMessage["role"]
      name: string | null
      content: string
    },
    [string, string, string]
  >(
    `
      SELECT role, name, content
      FROM messages
      WHERE profile_id = ?1 AND session_id = ?2 AND user_id = ?3
      ORDER BY id ASC
    `,
  )

  return query.all(profileId, sessionId, userId).map((row) => ({
    role: row.role,
    name: row.name ?? undefined,
    content: row.content,
  }))
}

export function appendMessages(
  db: Database,
  profileId: ProfileId,
  event: {
    sessionId: string
    userId: string
  },
  messages: AgentMessage[],
): void {
  const insertMessage = db.query<
    never,
    [string, string, string, string, string | null, string]
  >(
    `
      INSERT INTO messages (profile_id, session_id, user_id, role, name, content)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `,
  )

  const insertSearchRow = db.query<
    never,
    [string, string, string, string, string]
  >(
    `
      INSERT INTO message_search (profile_id, session_id, user_id, role, content)
      VALUES (?1, ?2, ?3, ?4, ?5)
    `,
  )

  const transaction = db.transaction((rows: AgentMessage[]) => {
    for (const message of rows) {
      insertMessage.run(profileId, event.sessionId, event.userId, message.role, message.name ?? null, message.content)
      insertSearchRow.run(profileId, event.sessionId, event.userId, message.role, message.content)
    }
  })

  transaction(messages)
}

export function searchMessages(db: Database, profileId: ProfileId, userId: string, query: string, limit = 3): MemoryHit[] {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) {
    return []
  }

  const matchQuery = tokens.map((token) => JSON.stringify(token)).join(" OR ")
  const search = db.query<
    {
      session_id: string
      role: string
      content: string
    },
    [string, string, string, number]
  >(
    `
      SELECT session_id, role, content
      FROM message_search
      WHERE profile_id = ?1
        AND user_id = ?2
        AND message_search MATCH ?3
      LIMIT ?4
    `,
  )

  return search.all(profileId, userId, matchQuery, limit).map((row) => ({
    source: `session:${row.session_id}:${row.role}`,
    content: row.content,
  }))
}
