import type { AgentState, Message } from '../types/index.js';
import type { LLMManager } from '../llm/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { Memory } from '../memory/sqlite.js';

export class Agent {
  private llm: LLMManager;
  private tools: ToolRegistry;
  private memory: Memory;
  private maxIterations: number;

  constructor(llm: LLMManager, tools: ToolRegistry, memory: Memory, maxIterations: number) {
    this.llm = llm;
    this.tools = tools;
    this.memory = memory;
    this.maxIterations = maxIterations;
  }

  async run(userMessage: string): Promise<string> {
    const systemPrompt = `You are Sammy, a helpful personal AI assistant. You have access to tools that you can use to help the user. Be concise and practical in your responses.`;

    const state: AgentState = {
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.memory.getMessages(),
        { role: 'user', content: userMessage },
      ],
      iterations: 0,
      maxIterations: this.maxIterations,
    };

    this.memory.addMessage('user', userMessage);

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
                  name: toolCall.name,
                  arguments: JSON.stringify(toolCall.arguments),
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
          this.memory.addMessage('assistant', response.content);
          break;
        }
      } catch (error) {
        finalResponse = `Error: ${(error as Error).message}`;
        break;
      }
    }

    if (state.iterations >= state.maxIterations && !finalResponse) {
      finalResponse = 'I apologize, but I reached the maximum number of iterations. Could you please try a more specific request?';
    }

    return finalResponse;
  }
}
