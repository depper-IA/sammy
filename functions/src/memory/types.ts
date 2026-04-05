import type { Message } from '../types/index.js';

export interface Memory {
  addMessage(role: Message['role'], content: string): void;
  getMessages(limit?: number): Message[];
  setFact(key: string, value: string): void;
  getFact(key: string): string | null;
  clearMessages(): void;
  close(): void;
}
