import Database from 'better-sqlite3';
import type { Message } from '../types/index.js';

export interface ActivityLog {
  id: number;
  agent_name: string;
  task_type: string;
  task_description: string | null;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  duration_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  finished_at: string | null;
  synced: number;
}

export interface ActivityStats {
  total: number;
  success: number;
  failed: number;
  cancelled: number;
  avg_duration_ms: number;
  total_duration_ms: number;
}

export class Memory {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL DEFAULT 'default',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agent_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        task_description TEXT,
        status TEXT DEFAULT 'running',
        duration_ms INTEGER,
        error_message TEXT,
        metadata TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME,
        synced INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(key);
      CREATE INDEX IF NOT EXISTS idx_activities_agent ON agent_activities(agent_name);
      CREATE INDEX IF NOT EXISTS idx_activities_created ON agent_activities(created_at);
      CREATE INDEX IF NOT EXISTS idx_activities_synced ON agent_activities(synced);
    `);

    const columns = this.db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
    const hasConversationId = columns.some((column) => column.name === 'conversation_id');
    if (!hasConversationId) {
      this.db.exec(`ALTER TABLE messages ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'default';`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at);`);
    }
  }

  addMessage(conversationId: string, role: Message['role'], content: string): void {
    const stmt = this.db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    );
    stmt.run(conversationId, role, content);
  }

  getMessages(conversationId: string, limit = 100): Message[] {
    const stmt = this.db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
    );
    const rows = stmt.all(conversationId, limit) as { role: string; content: string }[];
    return rows.map((row) => ({
      role: row.role as Message['role'],
      content: row.content,
    })).reverse();
  }

  setFact(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO facts (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, value);
  }

  getFact(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM facts WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  clearMessages(conversationId?: string): void {
    if (conversationId) {
      const stmt = this.db.prepare('DELETE FROM messages WHERE conversation_id = ?');
      stmt.run(conversationId);
      return;
    }

    this.db.exec('DELETE FROM messages');
  }

  // ─── Activity Logging ───────────────────────────────────────────

  logActivityStart(
    agentName: string,
    taskType: string,
    description: string,
    metadata?: Record<string, unknown>
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO agent_activities (agent_name, task_type, task_description, metadata)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      agentName,
      taskType,
      description,
      JSON.stringify(metadata ?? {})
    );
    return result.lastInsertRowid as number;
  }

  logActivityEnd(
    id: number,
    status: 'success' | 'failed' | 'cancelled',
    durationMs: number,
    errorMessage?: string
  ): void {
    const stmt = this.db.prepare(`
      UPDATE agent_activities
      SET status = ?, duration_ms = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(status, durationMs, errorMessage ?? null, id);
  }

  getUnsyncedActivities(limit = 100): ActivityLog[] {
    const stmt = this.db.prepare(`
      SELECT id, agent_name, task_type, task_description, status, duration_ms,
             error_message, metadata, created_at, finished_at, synced
      FROM agent_activities
      WHERE synced = 0
      ORDER BY created_at ASC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as Array<{
      id: number;
      agent_name: string;
      task_type: string;
      task_description: string | null;
      status: string;
      duration_ms: number | null;
      error_message: string | null;
      metadata: string;
      created_at: string;
      finished_at: string | null;
      synced: number;
    }>;
    return rows.map((row) => ({
      ...row,
      status: row.status as ActivityLog['status'],
      metadata: JSON.parse(row.metadata),
    }));
  }

  markActivitiesSynced(ids: number[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      UPDATE agent_activities SET synced = 1 WHERE id IN (${placeholders})
    `);
    stmt.run(...ids);
  }

  getActivityStats(agentName: string, since?: Date): ActivityStats {
    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        AVG(duration_ms) as avg_duration_ms,
        SUM(duration_ms) as total_duration_ms
      FROM agent_activities
      WHERE agent_name = ?
    `;
    const params: (string | Date)[] = [agentName];

    if (since) {
      query += ' AND created_at >= ?';
      params.push(since.toISOString());
    }

    const stmt = this.db.prepare(query);
    const row = stmt.get(...params) as {
      total: number;
      success: number;
      failed: number;
      cancelled: number;
      avg_duration_ms: number | null;
      total_duration_ms: number | null;
    };

    return {
      total: row.total ?? 0,
      success: row.success ?? 0,
      failed: row.failed ?? 0,
      cancelled: row.cancelled ?? 0,
      avg_duration_ms: row.avg_duration_ms ?? 0,
      total_duration_ms: row.total_duration_ms ?? 0,
    };
  }

  getRecentActivities(agentName?: string, limit = 50): ActivityLog[] {
    let query = `
      SELECT id, agent_name, task_type, task_description, status, duration_ms,
             error_message, metadata, created_at, finished_at, synced
      FROM agent_activities
    `;
    const params: (string | number)[] = [];

    if (agentName) {
      query += ' WHERE agent_name = ?';
      params.push(agentName);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: number;
      agent_name: string;
      task_type: string;
      task_description: string | null;
      status: string;
      duration_ms: number | null;
      error_message: string | null;
      metadata: string;
      created_at: string;
      finished_at: string | null;
      synced: number;
    }>;

    return rows.map((row) => ({
      ...row,
      status: row.status as ActivityLog['status'],
      metadata: JSON.parse(row.metadata),
    }));
  }

  getRecentErrors(limit = 20): ActivityLog[] {
    const stmt = this.db.prepare(`
      SELECT id, agent_name, task_type, task_description, status, duration_ms,
             error_message, metadata, created_at, finished_at, synced
      FROM agent_activities
      WHERE status IN ('failed', 'cancelled')
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as Array<{
      id: number;
      agent_name: string;
      task_type: string;
      task_description: string | null;
      status: string;
      duration_ms: number | null;
      error_message: string | null;
      metadata: string;
      created_at: string;
      finished_at: string | null;
      synced: number;
    }>;
    return rows.map((row) => ({
      ...row,
      status: row.status as ActivityLog['status'],
      metadata: JSON.parse(row.metadata),
    }));
  }

  close(): void {
    this.db.close();
  }
}
