import { createOpencode, type OpencodeClient } from '../../../.opencode/node_modules/@opencode-ai/sdk/dist/v2/index.js';
import type {
  AssistantMessage,
  Part,
  PermissionRequest,
  QuestionRequest,
  Session,
} from '../../../.opencode/node_modules/@opencode-ai/sdk/dist/v2/client.js';

type ChatState = {
  sessionId: string;
  agent: string;
};

type StreamCallback = (partialText: string, completedTools: string[]) => void;

function truncate(value: string, limit = 3500): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n...[truncado]`;
}

function extractTextFromParts(parts: Part[], assistantMessageId: string): string {
  const messageParts = parts.filter((part) => part.messageID === assistantMessageId);
  const text = messageParts
    .filter((part): part is Extract<Part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
  return text.trim();
}

function extractCompletedTools(parts: Part[], assistantMessageId: string): string[] {
  const messageParts = parts.filter((part) => part.messageID === assistantMessageId);
  const completedTools = messageParts.filter(
    (part): part is Extract<Part, { type: 'tool' }> =>
      part.type === 'tool' && part.state.status === 'completed'
  );
  return completedTools.map((tool) => `${tool.tool}: ${tool.state.status}`);
}

function extractPatchFiles(parts: Part[], assistantMessageId: string): string[] {
  const messageParts = parts.filter((part) => part.messageID === assistantMessageId);
  const patchFiles = messageParts
    .filter((part): part is Extract<Part, { type: 'patch' }> => part.type === 'patch')
    .flatMap((part) => part.files);
  return patchFiles;
}

export class OpenCodeBridge {
  private client: OpencodeClient;
  private closeServer: () => void;
  private projectRoot: string;

  private constructor(client: OpencodeClient, closeServer: () => void, projectRoot: string) {
    this.client = client;
    this.closeServer = closeServer;
    this.projectRoot = projectRoot;
  }

  static async create(projectRoot: string): Promise<OpenCodeBridge> {
    const { client, server } = await createOpencode({
      hostname: '127.0.0.1',
      port: 4317,
    });
    return new OpenCodeBridge(client, server.close, projectRoot);
  }

  async createSession(title: string): Promise<Session> {
    const response = await this.client.session.create({
      directory: this.projectRoot,
      title,
    });
    if (!response.data) {
      throw new Error('OpenCode no devolvió una sesión al crearla.');
    }
    return response.data;
  }

  async ensureSession(chatState: ChatState, title: string): Promise<Session> {
    if (chatState.sessionId) {
      const existing = await this.client.session.get({
        sessionID: chatState.sessionId,
        directory: this.projectRoot,
      });
      if (existing.data) {
        return existing.data;
      }
    }

    return this.createSession(title);
  }

  async prompt(
    chatState: ChatState,
    text: string,
    title: string,
    onStream?: StreamCallback
  ): Promise<string> {
    const session = await this.ensureSession(chatState, title);
    const response = await this.client.session.prompt({
      sessionID: session.id,
      directory: this.projectRoot,
      agent: chatState.agent,
      parts: [
        {
          type: 'text',
          text,
        },
      ],
    });

    const data = response.data;
    if (!data) {
      throw new Error('OpenCode no devolvió respuesta para el prompt.');
    }

    if (onStream) {
      const initialText = extractTextFromParts(data.parts, data.info.id);
      const initialTools = extractCompletedTools(data.parts, data.info.id);
      if (initialText || initialTools.length > 0) {
        onStream(initialText, initialTools);
      }
    }

    return this.renderFinalResponse(data.parts, data.info.id);
  }

  private renderFinalResponse(parts: Part[], assistantMessageId: string): string {
    const text = extractTextFromParts(parts, assistantMessageId);

    if (text) {
      return truncate(text.trim());
    }

    const patchFiles = extractPatchFiles(parts, assistantMessageId);

    if (patchFiles.length > 0) {
      return truncate(`Se aplicaron cambios en:\n${patchFiles.map((file) => `- ${file}`).join('\n')}`);
    }

    const completedTools = extractCompletedTools(parts, assistantMessageId);

    if (completedTools.length > 0) {
      return truncate(
        `La ejecución terminó sin texto final. Herramientas usadas:\n${completedTools.join('\n')}`
      );
    }

    return 'La sesión terminó, pero no devolvió texto visible.';
  }

  async listPendingPermissions(sessionId?: string): Promise<PermissionRequest[]> {
    const response = await this.client.permission.list({
      directory: this.projectRoot,
    });

    const permissions = response.data ?? [];
    if (!sessionId) {
      return permissions;
    }

    return permissions.filter((item) => item.sessionID === sessionId);
  }

  async replyPermission(
    requestId: string,
    reply: 'once' | 'always' | 'reject',
    message?: string
  ): Promise<void> {
    await this.client.permission.reply({
      requestID: requestId,
      directory: this.projectRoot,
      reply,
      message,
    });
  }

  async listPendingQuestions(sessionId?: string): Promise<QuestionRequest[]> {
    const response = await this.client.question.list({
      directory: this.projectRoot,
    });

    const questions = response.data ?? [];
    if (!sessionId) {
      return questions;
    }

    return questions.filter((item) => item.sessionID === sessionId);
  }

  async rejectQuestion(requestId: string): Promise<void> {
    await this.client.question.reject({
      requestID: requestId,
      directory: this.projectRoot,
    });
  }

  async getStatus(sessionId: string): Promise<string> {
    const sessionResponse = await this.client.session.get({
      sessionID: sessionId,
      directory: this.projectRoot,
    });
    const statusResponse = await this.client.session.status({
      directory: this.projectRoot,
    });

    const session = sessionResponse.data;
    if (!session) {
      throw new Error('No se encontró la sesión actual en OpenCode.');
    }

    const status = statusResponse.data?.[sessionId];

    return truncate(
      [
        `Sesión: ${session.id}`,
        `Título: ${session.title}`,
        `Agente: ${session.slug}`,
        `Estado: ${status?.type ?? 'desconocido'}`,
        `Directorio: ${session.directory}`,
      ].join('\n')
    );
  }

  async getDiff(sessionId: string): Promise<string> {
    const response = (await this.client.session.diff({
      sessionID: sessionId,
      directory: this.projectRoot,
    })) as { data?: unknown };

    const diff = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
    return truncate(diff || 'No hay diff disponible para esta sesión.');
  }

  async abort(sessionId: string): Promise<void> {
    await this.client.session.abort({
      sessionID: sessionId,
      directory: this.projectRoot,
    });
  }

  async close(): Promise<void> {
    this.closeServer();
  }
}
