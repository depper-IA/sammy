import type { LLMProvider } from '../llm/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { Memory } from '../memory/types.js';
export declare class Agent {
    private llm;
    private tools;
    private memory;
    private maxIterations;
    constructor(llm: LLMProvider, tools: ToolRegistry, memory: Memory, maxIterations: number);
    run(userMessage: string): Promise<string>;
}
