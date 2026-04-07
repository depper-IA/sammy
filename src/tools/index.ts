import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Tool, ToolDefinition } from '../types/index.js';

const MAX_FILE_BYTES = 32_000;
const MAX_SEARCH_RESULTS = 40;

function asObject(args?: Record<string, unknown>): Record<string, unknown> {
  return args ?? {};
}

function toSafeProjectPath(projectRoot: string, requestedPath = ''): string {
  const absoluteRoot = resolve(projectRoot);
  const absolutePath = resolve(absoluteRoot, requestedPath);

  if (!absolutePath.startsWith(absoluteRoot)) {
    throw new Error('La ruta solicitada está fuera del proyecto.');
  }

  return absolutePath;
}

function toRelative(projectRoot: string, filePath: string): string {
  return relative(projectRoot, filePath).replace(/\\/g, '/');
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[truncado]`;
}

function readTextFile(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r/g, '');
}

function shellResult(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `Command failed: ${command}`);
  }

  return (result.stdout || '').trim();
}

function buildToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'get_current_time',
      description: 'Get the current date and time. Returns timezone and formatted datetime.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'list_files',
      description: 'List files or folders inside the project. Useful to inspect the repository structure.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path inside the project. Defaults to the project root.' },
        },
        required: [],
      },
    },
    {
      name: 'read_file',
      description: 'Read a text file inside the project. Use this to inspect source files or docs.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file inside the project.' },
        },
        required: ['path'],
      },
    },
    {
      name: 'search_code',
      description: 'Search text across the project using ripgrep when available, otherwise a recursive fallback.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text or regex-like pattern to search for.' },
          path: { type: 'string', description: 'Optional relative subdirectory to restrict the search.' },
        },
        required: ['query'],
      },
    },
    {
      name: 'git_status',
      description: 'Get a short git status summary for the project root.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'read_project_context',
      description: 'Return the cached project context summary loaded from the main repo documents.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

export function createGetCurrentTimeTool(): Tool {
  return {
    name: 'get_current_time',
    description: 'Get the current date and time. Returns timezone and formatted datetime.',
    execute: async () => {
      const now = new Date();
      return {
        datetime: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        formatted: now.toLocaleString('es-CO', {
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
}

export function createListFilesTool(projectRoot: string): Tool {
  return {
    name: 'list_files',
    description: 'List files or folders inside the project.',
    execute: async (args) => {
      const input = asObject(args);
      const relativePath = typeof input.path === 'string' ? input.path : '.';
      const absolutePath = toSafeProjectPath(projectRoot, relativePath);

      if (!existsSync(absolutePath)) {
        throw new Error('La ruta no existe dentro del proyecto.');
      }

      const entries = readdirSync(absolutePath, { withFileTypes: true })
        .slice(0, 200)
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: toRelative(projectRoot, join(absolutePath, entry.name)),
        }));

      return {
        path: normalize(relativePath).replace(/\\/g, '/'),
        entries,
      };
    },
  };
}

export function createReadFileTool(projectRoot: string): Tool {
  return {
    name: 'read_file',
    description: 'Read a text file inside the project.',
    execute: async (args) => {
      const input = asObject(args);
      const relativePath = typeof input.path === 'string' ? input.path : '';
      if (!relativePath) {
        throw new Error('Debes enviar la ruta del archivo.');
      }

      const absolutePath = toSafeProjectPath(projectRoot, relativePath);
      if (!existsSync(absolutePath)) {
        throw new Error('El archivo no existe.');
      }

      if (statSync(absolutePath).isDirectory()) {
        throw new Error('La ruta enviada es un directorio, no un archivo.');
      }

      const raw = readTextFile(absolutePath);
      return {
        path: toRelative(projectRoot, absolutePath),
        content: truncateText(raw, MAX_FILE_BYTES),
      };
    },
  };
}

export function createSearchCodeTool(projectRoot: string): Tool {
  return {
    name: 'search_code',
    description: 'Search text across the project.',
    execute: async (args) => {
      const input = asObject(args);
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      const relativePath = typeof input.path === 'string' ? input.path : '.';
      if (!query) {
        throw new Error('Debes enviar un texto para buscar.');
      }

      const searchRoot = toSafeProjectPath(projectRoot, relativePath);

      try {
        const output = shellResult(
          'rg',
          ['-n', '--no-heading', '--color', 'never', '--max-count', String(MAX_SEARCH_RESULTS), query, searchRoot],
          projectRoot
        );

        return {
          query,
          path: normalize(relativePath).replace(/\\/g, '/'),
          results: output ? output.split('\n') : [],
        };
      } catch {
        const results: string[] = [];
        const visit = (currentPath: string): void => {
          if (results.length >= MAX_SEARCH_RESULTS) {
            return;
          }

          for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
            if (results.length >= MAX_SEARCH_RESULTS) {
              return;
            }

            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
              continue;
            }

            const fullPath = join(currentPath, entry.name);
            if (entry.isDirectory()) {
              visit(fullPath);
              continue;
            }

            try {
              const content = readTextFile(fullPath);
              const lines = content.split('\n');
              lines.forEach((line, index) => {
                if (results.length < MAX_SEARCH_RESULTS && line.includes(query)) {
                  results.push(`${toRelative(projectRoot, fullPath)}:${index + 1}:${line.trim()}`);
                }
              });
            } catch {
              // Ignore unreadable or binary files.
            }
          }
        };

        visit(searchRoot);

        return {
          query,
          path: normalize(relativePath).replace(/\\/g, '/'),
          results,
        };
      }
    },
  };
}

export function createGitStatusTool(projectRoot: string): Tool {
  return {
    name: 'git_status',
    description: 'Get a short git status summary for the project.',
    execute: async () => {
      try {
        const output = shellResult('git', ['status', '--short'], projectRoot);
        return {
          output: output || 'Working tree clean',
        };
      } catch (error) {
        return {
          output: `No fue posible obtener git status: ${(error as Error).message}`,
        };
      }
    },
  };
}

export function createReadProjectContextTool(getContext: () => string): Tool {
  return {
    name: 'read_project_context',
    description: 'Return the cached project context summary.',
    execute: async () => ({
      context: getContext(),
    }),
  };
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private definitions: ToolDefinition[];

  constructor(projectRoot: string, getProjectContext: () => string) {
    this.definitions = buildToolDefinitions();

    [
      createGetCurrentTimeTool(),
      createListFilesTool(projectRoot),
      createReadFileTool(projectRoot),
      createSearchCodeTool(projectRoot),
      createGitStatusTool(projectRoot),
      createReadProjectContextTool(getProjectContext),
    ].forEach((tool) => this.register(tool));
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
    return this.definitions;
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}
