import type { Message } from '../types/index.js';
import type { Memory } from './types.js';
export declare class FirestoreMemory implements Memory {
    private userId;
    constructor(userId?: string);
    private get collection();
    private get factsCollection();
    addMessage(role: Message['role'], content: string): void;
    getMessages(limit?: number): Message[];
    getMessagesAsync(limit?: number): Promise<Message[]>;
    setFact(key: string, value: string): void;
    getFact(key: string): string | null;
    getFactAsync(key: string): Promise<string | null>;
    clearMessages(): void;
    close(): void;
}
