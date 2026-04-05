export function parseUpdate(body) {
    if (!body || typeof body !== 'object')
        return null;
    const update = body;
    if (!update.message || typeof update.message !== 'object')
        return null;
    const message = update.message;
    if (!message.from || typeof message.from !== 'object')
        return null;
    const from = message.from;
    if (typeof from.id !== 'number')
        return null;
    if (typeof message.chat !== 'object')
        return null;
    const chat = message.chat;
    if (typeof chat.id !== 'number')
        return null;
    return {
        message: {
            from: { id: from.id, first_name: from.first_name, last_name: from.last_name },
            chat: { id: chat.id },
            text: typeof message.text === 'string' ? message.text : '',
        },
    };
}
//# sourceMappingURL=telegram-webhook.js.map