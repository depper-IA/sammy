import type { Tool, ToolDefinition } from '../types/index.js';
export declare const getCurrentTimeTool: Tool;
export declare function getToolDefinitions(): ToolDefinition[];
export declare class ToolRegistry {
    private tools;
    constructor();
    register(tool: Tool): void;
    execute(name: string, args?: Record<string, unknown>): Promise<unknown>;
    getDefinitions(): ToolDefinition[];
    hasTool(name: string): boolean;
}
