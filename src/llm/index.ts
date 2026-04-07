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

type ProviderMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

function toProviderMessages(messages: Message[]): ProviderMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
  }));
}

function toProviderTools(tools?: ToolDefinition[]): Array<Record<string, unknown>> | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

async function parseError(response: Response, providerName: string): Promise<Error> {
  const errorText = await response.text();
  return new Error(`${providerName} API error: ${response.status} - ${errorText}`);
}

export class GroqProvider implements LLMProvider {
  name = 'groq';

  constructor(private apiKey: string) {}

  async complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const requestBody: Record<string, unknown> = {
      model: 'llama-3.3-70b-versatile',
      messages: toProviderMessages(messages),
      temperature: 0.2,
      max_tokens: 1024,
    };

    const providerTools = toProviderTools(tools);
    if (providerTools) {
      requestBody.tools = providerTools;
      requestBody.tool_choice = 'auto';
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
      throw await parseError(response, 'Groq');
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const choice = data.choices[0];
    const message = choice.message;

    return {
      content: message.content ?? '',
      toolCalls: message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
      })),
    };
  }
}

export class OpenRouterProvider implements LLMProvider {
  name = 'openrouter';

  constructor(private apiKey: string, private model: string) {}

  async complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: toProviderMessages(messages),
      temperature: 0.2,
      max_tokens: 1024,
    };

    const providerTools = toProviderTools(tools);
    if (providerTools) {
      requestBody.tools = providerTools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://local.sammy',
        'X-Title': 'Sammy Local Agent',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw await parseError(response, 'OpenRouter');
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const choice = data.choices[0];
    const message = choice.message;

    return {
      content: message.content ?? '',
      toolCalls: message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
      })),
    };
  }
}

export class LLMManager {
  private providers: LLMProvider[];
  private currentProviderIndex = 0;

  constructor(providers: LLMProvider[]) {
    this.providers = providers;
  }

  async complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[(this.currentProviderIndex + i) % this.providers.length];
      try {
        const result = await provider.complete(messages, tools);
        this.currentProviderIndex = (this.currentProviderIndex + i) % this.providers.length;
        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(`Provider ${provider.name} failed:`, lastError.message);
      }
    }

    throw lastError ?? new Error('All LLM providers failed');
  }
}
