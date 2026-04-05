import type { Tool, ToolDefinition } from '../types/index.js';

export const getCurrentTimeTool: Tool = {
  name: 'get_current_time',
  description: 'Get the current date and time. Returns timezone and formatted datetime.',
  execute: async () => {
    const now = new Date();
    return {
      datetime: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      formatted: now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    };
  },
};

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: getCurrentTimeTool.name,
      description: getCurrentTimeTool.description,
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.register(getCurrentTimeTool);
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  async execute(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.execute(args);
  }

  getDefinitions(): ToolDefinition[] {
    return getToolDefinitions();
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}
