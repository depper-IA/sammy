import * as admin from 'firebase-admin';
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'lookitry-67844',
});
const db = admin.firestore();
export class FirestoreMemory {
    userId;
    constructor(userId = 'default') {
        this.userId = userId;
    }
    get collection() {
        return db.collection('sammy_memory').doc(this.userId).collection('messages');
    }
    get factsCollection() {
        return db.collection('sammy_facts').doc(this.userId).collection('facts');
    }
    addMessage(role, content) {
        this.collection.add({
            role,
            content,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    getMessages(limit = 100) {
        return [];
    }
    async getMessagesAsync(limit = 100) {
        const snapshot = await this.collection
            .orderBy('createdAt', 'asc')
            .limit(limit)
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                role: data.role,
                content: data.content,
            };
        });
    }
    setFact(key, value) {
        this.factsCollection.doc(key).set({
            value,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    getFact(key) {
        return null;
    }
    async getFactAsync(key) {
        const doc = await this.factsCollection.doc(key).get();
        if (!doc.exists)
            return null;
        return doc.data()?.value;
    }
    clearMessages() {
        this.collection.get().then((snapshot) => {
            const batch = db.batch();
            snapshot.docs.forEach((doc) => batch.delete(doc.ref));
            batch.commit();
        });
    }
    close() { }
}
//# sourceMappingURL=firestore.js.map