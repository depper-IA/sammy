import { onRequest } from 'firebase-functions/v2/https';
import { parseUpdate } from './telegram-webhook.js';
import { FirestoreMemory } from './memory/firestore.js';
import { GroqProvider, OpenRouterProvider } from './llm/index.js';
import { ToolRegistry } from './tools/index.js';
import { Agent } from './agent/index.js';
const config = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    telegramAllowedUserIds: new Set((process.env.TELEGRAM_ALLOWED_USER_IDS ?? '1049458877')
        .split(',')
        .map((id) => parseInt(id.trim(), 10))),
    groqApiKey: process.env.GROQ_API_KEY ?? '',
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
    openrouterModel: process.env.OPENROUTER_MODEL ?? 'openrouter/llama-3.3-70b-instruct',
    maxAgentIterations: parseInt(process.env.MAX_AGENT_ITERATIONS ?? '10', 10),
};
let agent;
let agentPromise = null;
async function initAgent() {
    if (agent)
        return agent;
    const groqProvider = new GroqProvider(config.groqApiKey);
    const providers = [groqProvider];
    if (config.openrouterApiKey) {
        providers.push(new OpenRouterProvider(config.openrouterApiKey, config.openrouterModel));
    }
    const memory = new FirestoreMemory();
    const tools = new ToolRegistry();
    agent = new Agent(providers[0], tools, memory, config.maxAgentIterations);
    return agent;
}
export const webhook = onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    try {
        const update = parseUpdate(req.body);
        if (!update || !update.message?.from || !update.message.text) {
            res.status(200).send('OK');
            return;
        }
        const userId = update.message.from.id;
        if (!config.telegramAllowedUserIds.has(userId)) {
            console.warn(`Unauthorized access from user ID: ${userId}`);
            res.status(200).send('OK');
            return;
        }
        const text = update.message.text;
        if (text.startsWith('/')) {
            res.status(200).send('OK');
            return;
        }
        const sammy = await initAgent();
        const response = await sammy.run(text);
        await sendTelegramMessage(config.telegramBotToken, update.message.chat.id, response);
        res.status(200).send('OK');
    }
    catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal server error');
    }
});
async function sendTelegramMessage(token, chatId, text) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
}
//# sourceMappingURL=index.js.map