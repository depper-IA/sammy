export class GroqProvider {
    apiKey;
    name = 'groq';
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async complete(messages, tools) {
        const systemMessage = messages.find((m) => m.role === 'system');
        const conversationMessages = messages.filter((m) => m.role !== 'system');
        const requestBody = {
            model: 'llama-3.3-70b-versatile',
            messages: [
                ...(systemMessage ? [{ role: 'system', content: systemMessage.content }] : []),
                ...conversationMessages.map((m) => ({
                    role: m.role,
                    content: m.content,
                    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
                })),
            ],
            temperature: 0.7,
            max_tokens: 1024,
        };
        if (tools && tools.length > 0) {
            requestBody.tools = tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
            }));
        }
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Groq API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        const choice = data.choices[0];
        const message = choice.message;
        return {
            content: message.content ?? '',
            toolCalls: message.tool_calls?.map((tc) => ({
                id: tc.id,
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments),
            })),
        };
    }
}
export class OpenRouterProvider {
    apiKey;
    model;
    name = 'openrouter';
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.model = model;
    }
    async complete(messages, tools) {
        const systemMessage = messages.find((m) => m.role === 'system');
        const conversationMessages = messages.filter((m) => m.role !== 'system');
        const requestBody = {
            model: this.model,
            messages: [
                ...(systemMessage ? [{ role: 'system', content: systemMessage.content }] : []),
                ...conversationMessages.map((m) => ({
                    role: m.role,
                    content: m.content,
                    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
                })),
            ],
            temperature: 0.7,
            max_tokens: 1024,
        };
        if (tools && tools.length > 0) {
            requestBody.tools = tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
            }));
        }
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        const choice = data.choices[0];
        const message = choice.message;
        return {
            content: message.content ?? '',
            toolCalls: message.tool_calls?.map((tc) => ({
                id: tc.id,
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments),
            })),
        };
    }
}
export class LLMManager {
    providers;
    currentProviderIndex = 0;
    constructor(providers) {
        this.providers = providers;
    }
    async complete(messages, tools) {
        let lastError = null;
        for (let i = 0; i < this.providers.length; i++) {
            const provider = this.providers[(this.currentProviderIndex + i) % this.providers.length];
            try {
                const result = await provider.complete(messages, tools);
                this.currentProviderIndex = (this.currentProviderIndex + i) % this.providers.length;
                return result;
            }
            catch (error) {
                lastError = error;
                console.error(`Provider ${provider.name} failed:`, lastError.message);
            }
        }
        throw lastError ?? new Error('All LLM providers failed');
    }
}
//# sourceMappingURL=index.js.map