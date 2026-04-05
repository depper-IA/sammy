export interface Tool {
  name: string;
  description: string;
  execute: (args?: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface AgentState {
  messages: Message[];
  iterations: number;
  maxIterations: number;
}

export interface Config {
  telegramBotToken: string;
  telegramAllowedUserIds: Set<number>;
  groqApiKey: string;
  openrouterApiKey: string;
  openrouterModel: string;
  maxAgentIterations: number;
}
