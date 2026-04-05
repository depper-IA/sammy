import * as admin from 'firebase-admin';
import type { Message } from '../types/index.js';
import type { Memory } from './types.js';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'lookitry-67844',
});

const db = admin.firestore();

export class FirestoreMemory implements Memory {
  private userId: string;

  constructor(userId = 'default') {
    this.userId = userId;
  }

  private get collection() {
    return db.collection('sammy_memory').doc(this.userId).collection('messages');
  }

  private get factsCollection() {
    return db.collection('sammy_facts').doc(this.userId).collection('facts');
  }

  addMessage(role: Message['role'], content: string): void {
    this.collection.add({
      role,
      content,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  getMessages(limit = 100): Message[] {
    return [];
  }

  async getMessagesAsync(limit = 100): Promise<Message[]> {
    const snapshot = await this.collection
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        role: data.role as Message['role'],
        content: data.content as string,
      };
    });
  }

  setFact(key: string, value: string): void {
    this.factsCollection.doc(key).set({
      value,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  getFact(key: string): string | null {
    return null;
  }

  async getFactAsync(key: string): Promise<string | null> {
    const doc = await this.factsCollection.doc(key).get();
    if (!doc.exists) return null;
    return doc.data()?.value as string;
  }

  clearMessages(): void {
    this.collection.get().then((snapshot) => {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      batch.commit();
    });
  }

  close(): void {}
}
