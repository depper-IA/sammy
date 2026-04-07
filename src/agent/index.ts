import type { AgentState, Message } from '../types/index.js';
import type { LLMManager } from '../llm/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { Memory } from '../memory/sqlite.js';

export class Agent {
  private llm: LLMManager;
  private tools: ToolRegistry;
  private memory: Memory;
  private maxIterations: number;
  private getProjectContext: () => string;

  constructor(
    llm: LLMManager,
    tools: ToolRegistry,
    memory: Memory,
    maxIterations: number,
    getProjectContext: () => string
  ) {
    this.llm = llm;
    this.tools = tools;
    this.memory = memory;
    this.maxIterations = maxIterations;
    this.getProjectContext = getProjectContext;
  }

  async run(userMessage: string, conversationId = 'default'): Promise<string> {
    const projectContext = this.getProjectContext();
    const systemPrompt = `You are Sammy, a helpful personal AI assistant connected to the user's project repository. Reply in Spanish by default unless the user asks for another language. You can use tools when they improve accuracy. Be concise, practical, and safe.

Always prioritize the repository context before making assumptions. If the user asks about the project, use the available tools to inspect files, search code, and check git state.

Base project context:
${projectContext}`;

    const state: AgentState = {
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.memory.getMessages(conversationId),
        { role: 'user', content: userMessage },
      ],
      iterations: 0,
      maxIterations: this.maxIterations,
    };

    this.memory.addMessage(conversationId, 'user', userMessage);

    let finalResponse = '';

    while (state.iterations < state.maxIterations) {
      state.iterations++;

      try {
        const response = await this.llm.complete(state.messages, this.tools.getDefinitions());

        if (response.toolCalls && response.toolCalls.length > 0) {
          for (const toolCall of response.toolCalls) {
            const toolMessage: Message = {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: toolCall.id,
                  type: 'function',
                  function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.arguments),
                  },
                },
              ],
            };
            state.messages.push(toolMessage);

            try {
              if (!this.tools.hasTool(toolCall.name)) {
                throw new Error(`Unknown tool: ${toolCall.name}`);
              }

              const result = await this.tools.execute(toolCall.name, toolCall.arguments);

              const toolResultMessage: Message = {
                role: 'tool',
                content: JSON.stringify(result),
                tool_call_id: toolCall.id,
              };
              state.messages.push(toolResultMessage);
            } catch (toolError) {
              const errorMessage: Message = {
                role: 'tool',
                content: `Error: ${(toolError as Error).message}`,
                tool_call_id: toolCall.id,
              };
              state.messages.push(errorMessage);
            }
          }
        } else {
          finalResponse = response.content;
          this.memory.addMessage(conversationId, 'assistant', response.content);
          break;
        }
      } catch (error) {
        finalResponse = `Error: ${(error as Error).message}`;
        break;
      }
    }

    if (state.iterations >= state.maxIterations && !finalResponse) {
      finalResponse = 'Llegué al límite de iteraciones. Intenta con una petición más específica.';
    }

    return finalResponse;
  }
}
