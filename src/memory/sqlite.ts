import Database from 'better-sqlite3';
import type { Message } from '../types/index.js';

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

      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(key);
    `);
  }

  addMessage(role: Message['role'], content: string): void {
    const stmt = this.db.prepare(
      'INSERT INTO messages (role, content) VALUES (?, ?)'
    );
    stmt.run(role, content);
  }

  getMessages(limit = 100): Message[] {
    const stmt = this.db.prepare(
      'SELECT role, content FROM messages ORDER BY created_at DESC LIMIT ?'
    );
    const rows = stmt.all(limit) as { role: string; content: string }[];
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

  clearMessages(): void {
    this.db.exec('DELETE FROM messages');
  }

  close(): void {
    this.db.close();
  }
}
