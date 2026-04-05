import type { Message, ToolDefinition } from '../types/index.js';
export interface LLMResponse {
    content: string;
    toolCalls?: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>;
}
export interface LLMProvider {
    name: string;
    complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}
export declare class GroqProvider implements LLMProvider {
    private apiKey;
    name: string;
    constructor(apiKey: string);
    complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}
export declare class OpenRouterProvider implements LLMProvider {
    private apiKey;
    private model;
    name: string;
    constructor(apiKey: string, model: string);
    complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}
export declare class LLMManager {
    private providers;
    private currentProviderIndex;
    constructor(providers: LLMProvider[]);
    complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}
