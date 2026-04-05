import * as admin from 'firebase-admin';
import type { Message } from '../types/index.js';

admin.initializeApp();

const db = admin.firestore();

export class FirestoreMemory {
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

  async addMessage(role: Message['role'], content: string): Promise<void> {
    await this.collection.add({
      role,
      content,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async getMessages(limit = 100): Promise<Message[]> {
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

  async setFact(key: string, value: string): Promise<void> {
    const ref = this.factsCollection.doc(key);
    await ref.set({
      value,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async getFact(key: string): Promise<string | null> {
    const doc = await this.factsCollection.doc(key).get();
    if (!doc.exists) return null;
    return doc.data()?.value as string;
  }

  async clearMessages(): Promise<void> {
    const snapshot = await this.collection.get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}
