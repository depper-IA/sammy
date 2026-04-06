import { config as dotenvConfig } from 'dotenv';
import { loadConfig } from './config/index.js';
import { Memory } from './memory/sqlite.js';
import { TelegramBot, type AudioPayload, type ImagePayload } from './bot/index.js';
import { OpenCodeBridge } from './opencode/client.js';
import { transcribeWithGroq, analyzeImageWithOpenRouter } from './audio/groq.js';

dotenvConfig();

console.log('Starting Sammy...');

const config = loadConfig();
console.log(`Config loaded. Allowed users: ${config.telegramAllowedUserIds.size}`);

const memory = new Memory(config.dbPath);
console.log(`Memory initialized at ${config.dbPath}`);
console.log(`Project root configured at ${config.projectRoot}`);

const bridge = await OpenCodeBridge.create(config.projectRoot);
console.log('OpenCode bridge initialized');

const bot = new TelegramBot(config);

const DEFAULT_AGENT = 'build';

function factKey(chatId: string, suffix: string): string {
  return `telegram_chat_${chatId}_${suffix}`;
}

function getChatState(chatId: string): { sessionId: string; agent: string } {
  return {
    sessionId: memory.getFact(factKey(chatId, 'session_id')) ?? '',
    agent: memory.getFact(factKey(chatId, 'agent')) ?? DEFAULT_AGENT,
  };
}

function setChatState(
  chatId: string,
  state: { sessionId?: string; agent?: string }
): { sessionId: string; agent: string } {
  const current = getChatState(chatId);
  const next = {
    sessionId: state.sessionId ?? current.sessionId,
    agent: state.agent ?? current.agent,
  };

  memory.setFact(factKey(chatId, 'session_id'), next.sessionId);
  memory.setFact(factKey(chatId, 'agent'), next.agent);
  return next;
}

async function ensureSession(chatId: string): Promise<{ sessionId: string; agent: string }> {
  const state = getChatState(chatId);
  if (state.sessionId) {
    return state;
  }

  const session = await bridge.createSession(`Telegram ${chatId}`);
  return setChatState(chatId, { sessionId: session.id });
}

function buildProgressMessage(partialText: string, tools: string[], iteration: number): string {
  const lines: string[] = [];

  lines.push('⏳ Procesando...');

  if (iteration > 0) {
    lines.push(`📍 Iteración ${iteration}`);
  }

  if (tools.length > 0) {
    lines.push('🔧 Herramientas usadas:');
    tools.slice(-3).forEach((tool) => {
      lines.push(`   ${tool}`);
    });
  }

  if (partialText) {
    const preview = partialText.slice(-500);
    lines.push('\n📝 Respuesta parcial:');
    lines.push(preview);
  }

  return lines.join('\n');
}

bot.onText(async (ctx, text) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const state = await ensureSession(chatId);

  const progressMsg = await ctx.reply('⏳ Procesando tu solicitud...');

  try {
    let iteration = 0;
    let lastPartialText = '';
    let lastTools: string[] = [];
    const MAX_ITERATIONS = 30;

    const result = await bridge.prompt(
      state,
      text,
      `Telegram ${chatId}`,
      (partialText, tools) => {
        if (partialText !== lastPartialText || tools.length !== lastTools.length) {
          iteration++;

          if (iteration <= MAX_ITERATIONS) {
            const progressText = buildProgressMessage(partialText, tools, iteration);
            ctx.api.editMessageText(ctx.chat!.id, progressMsg.message_id, progressText).catch(() => {});
          }

          lastPartialText = partialText;
          lastTools = tools;
        }
      }
    );

    const finalMessage = result.length > 4000 ? `${result.slice(0, 4000)}\n\n(continúa...)` : result;
    ctx.api.editMessageText(ctx.chat!.id, progressMsg.message_id, `✅ Listo!\n\n${finalMessage}`).catch(() => {});
  } catch (error) {
    const errorMessage = (error as Error).message;
    ctx.api
      .editMessageText(ctx.chat!.id, progressMsg.message_id, `❌ Error:\n${errorMessage}`)
      .catch(() => {});
  }
});

bot.onAudio(async (ctx, payload) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const state = await ensureSession(chatId);
  const maxBytes = config.maxAudioFileSizeMb * 1024 * 1024;

  if (payload.fileSize && payload.fileSize > maxBytes) {
    await ctx.reply(
      `El audio supera el límite configurado de ${config.maxAudioFileSizeMb} MB. Envíame un audio más corto.`
    );
    return;
  }

  await ctx.reply('Recibí tu audio. Lo estoy transcribiendo con Groq...');

  try {
    const audioBuffer = await bot.downloadFile(payload.fileId);
    if (audioBuffer.byteLength > maxBytes) {
      await ctx.reply(
        `El archivo descargado supera ${config.maxAudioFileSizeMb} MB. Envíame un audio más corto.`
      );
      return;
    }

    const transcript = await transcribeWithGroq({
      apiKey: config.groqApiKey,
      buffer: audioBuffer,
      filename: payload.filename,
      mimeType: payload.mimeType,
      language: 'es',
    });

    const prompt =
      `[Audio de Telegram transcrito con Groq]\n` +
      `Tipo: ${payload.kind}\n` +
      `${payload.duration ? `Duración aproximada: ${payload.duration}s\n` : ''}` +
      `Transcripción:\n${transcript}`;

    const progressMsg = await ctx.reply('⏳ Procesando tu solicitud...');

    let iteration = 0;
    let lastPartialText = '';
    let lastTools: string[] = [];

    const result = await bridge.prompt(
      state,
      prompt,
      `Telegram ${chatId}`,
      (partialText, tools) => {
        if (partialText !== lastPartialText || tools.length !== lastTools.length) {
          iteration++;
          if (iteration <= 30) {
            const progressText = buildProgressMessage(partialText, tools, iteration);
            ctx.api.editMessageText(ctx.chat!.id, progressMsg.message_id, progressText).catch(() => {});
          }
          lastPartialText = partialText;
          lastTools = tools;
        }
      }
    );

    ctx.api
      .editMessageText(ctx.chat!.id, progressMsg.message_id, `✅ Listo!\n\n${result}`)
      .catch(() => {});
  } catch (error) {
    const message = (error as Error).message;
    await ctx.reply(`No pude procesar tu audio:\n${message}`);
  }
});

bot.onPhoto(async (ctx, payload) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const state = await ensureSession(chatId);
  const maxBytes = 10 * 1024 * 1024;

  if (payload.fileSize && payload.fileSize > maxBytes) {
    await ctx.reply(
      `La imagen supera el límite de 10 MB. Envíame una imagen más pequeña.`
    );
    return;
  }

  const progressMsg = await ctx.reply('📷 Recibí tu imagen. Analizando con visión...');

  try {
    const imageBuffer = await bot.downloadFile(payload.fileId);
    if (imageBuffer.byteLength > maxBytes) {
      ctx.api
        .editMessageText(ctx.chat!.id, progressMsg.message_id, 'La imagen es demasiado grande. Máx 10 MB.')
        .catch(() => {});
      return;
    }

    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // 1. Analizar imagen con OpenRouter Vision
    const visionAnalysis = await analyzeImageWithOpenRouter({
      apiKey: config.openrouterApiKey,
      base64Image,
      mimeType: payload.mimeType,
      prompt:
        'Eres un experto en debugging. Analiza esta imagen y describe: ' +
        '1) Qué se muestra (código, error, interfaz, etc) ' +
        '2) Errores visibles específicos ' +
        '3) Posibles causas del problema. ' +
        'Sé técnico y específico en tu análisis.',
    });

    // 2. Editar mensaje para indicar que se pasó a Sammy
    await ctx.api.editMessageText(
      ctx.chat!.id,
      progressMsg.message_id,
      '🔍 Análisis completado. Enviando a Sammy para corrección...'
    );

    // 3. Crear prompt enriquecido para OpenCode
    const prompt =
      `[Imagen analizada con OpenRouter Vision (Gemini 2.5 Flash)]\n` +
      `Nombre: ${payload.filename}\n` +
      `Tamaño: ${payload.width}x${payload.height}\n` +
      `Peso: ${(imageBuffer.byteLength / 1024).toFixed(1)} KB\n\n` +
      `--- ANÁLISIS DE LA IMAGEN ---\n` +
      visionAnalysis +
      `\n\n--- INSTRUCCIÓN ---\n` +
      `Con base en el análisis anterior, identifica el problema y corrígelo en el código. ` +
      `Si es un error de código, aplica los cambios necesarios. ` +
      `Si necesitas más contexto, pregunta qué archivo o sección debo revisar.`;

    let iteration = 0;
    let lastPartialText = '';
    let lastTools: string[] = [];

    const result = await bridge.prompt(
      state,
      prompt,
      `Telegram ${chatId}`,
      (partialText, tools) => {
        if (partialText !== lastPartialText || tools.length !== lastTools.length) {
          iteration++;
          if (iteration <= 30) {
            const progressText = buildProgressMessage(partialText, tools, iteration);
            ctx.api.editMessageText(ctx.chat!.id, progressMsg.message_id, progressText).catch(() => {});
          }
          lastPartialText = partialText;
          lastTools = tools;
        }
      }
    );

    ctx.api
      .editMessageText(ctx.chat!.id, progressMsg.message_id, `✅ Listo!\n\n${result}`)
      .catch(() => {});
  } catch (error) {
    const message = (error as Error).message;
    ctx.api
      .editMessageText(ctx.chat!.id, progressMsg.message_id, `❌ Error al procesar imagen:\n${message}`)
      .catch(() => {});
  }
});

bot.onCommand('start', async (ctx) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const state = await ensureSession(chatId);
  await ctx.reply(
    `Sammy está conectado a OpenCode.\n\n` +
      `Sesión actual: ${state.sessionId}\n` +
      `Agente actual: ${state.agent}\n\n` +
      `📍 Streaming activo - verás el progreso en tiempo real!\n\n` +
      `Comandos:\n` +
      `/agent <nombre>\n` +
      `/new\n` +
      `/status\n` +
      `/diff\n` +
      `/permissions\n` +
      `/approve <requestId> [once|always]\n` +
      `/reject <requestId>\n` +
      `/abort\n\n` +
      `También puedes enviarme audios, imágenes y los transcribiré/analizaré.`
  );
});

bot.onCommand('help', async (ctx) => {
  await ctx.reply(
    `Sammy usa OpenCode como motor real.\n\n` +
      `📍 Streaming activo - verás el progreso en tiempo real!\n\n` +
      `Comandos:\n` +
      `/start - Inicializa sesión\n` +
      `/agent <nombre> - Cambia el agente de OpenCode\n` +
      `/new - Crea una sesión nueva\n` +
      `/status - Estado de la sesión actual\n` +
      `/diff - Diff acumulado de la sesión\n` +
      `/permissions - Lista permisos pendientes\n` +
      `/approve <requestId> [once|always] - Aprueba un permiso\n` +
      `/reject <requestId> - Rechaza un permiso\n` +
      `/abort - Aborta la sesión activa\n\n` +
      `También puedes enviarme audios y los transcribiré con Groq antes de pasarlos a OpenCode.`
  );
});

bot.onCommand('new', async (ctx) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const current = getChatState(chatId);
  const session = await bridge.createSession(`Telegram ${chatId}`);
  const state = setChatState(chatId, { sessionId: session.id, agent: current.agent });
  await ctx.reply(
    `Nueva sesión creada.\nSesión: ${state.sessionId}\nAgente: ${state.agent}`
  );
});

bot.onCommand('agent', async (ctx) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const text = ctx.message?.text ?? '';
  const agent = text.replace(/^\/agent(@\w+)?\s*/i, '').trim();

  if (!agent) {
    const state = getChatState(chatId);
    await ctx.reply(`Agente actual: ${state.agent}`);
    return;
  }

  setChatState(chatId, { agent });
  await ctx.reply(`Agente configurado: ${agent}`);
});

bot.onCommand('status', async (ctx) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const state = await ensureSession(chatId);
  const status = await bridge.getStatus(state.sessionId);
  await ctx.reply(status);
});

bot.onCommand('diff', async (ctx) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const state = await ensureSession(chatId);
  const diff = await bridge.getDiff(state.sessionId);
  await ctx.reply(diff);
});

bot.onCommand('permissions', async (ctx) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const state = await ensureSession(chatId);
  const permissions = await bridge.listPendingPermissions(state.sessionId);

  if (permissions.length === 0) {
    await ctx.reply('No hay permisos pendientes para esta sesión.');
    return;
  }

  const message = permissions
    .map((item) => {
      const patterns = item.patterns.length > 0 ? item.patterns.join(', ') : '(sin patrón)';
      return `ID: ${item.id}\nPermiso: ${item.permission}\nPatrones: ${patterns}`;
    })
    .join('\n\n');

  await ctx.reply(message.slice(0, 3500));
});

bot.onCommand('approve', async (ctx) => {
  const text = ctx.message?.text ?? '';
  const args = text.replace(/^\/approve(@\w+)?\s*/i, '').trim().split(/\s+/).filter(Boolean);
  const requestId = args[0];
  const reply = args[1] === 'always' ? 'always' : 'once';

  if (!requestId) {
    await ctx.reply('Uso: /approve <requestId> [once|always]');
    return;
  }

  await bridge.replyPermission(requestId, reply);
  await ctx.reply(`Permiso ${requestId} aprobado con modo ${reply}.`);
});

bot.onCommand('reject', async (ctx) => {
  const text = ctx.message?.text ?? '';
  const requestId = text.replace(/^\/reject(@\w+)?\s*/i, '').trim();

  if (!requestId) {
    await ctx.reply('Uso: /reject <requestId>');
    return;
  }

  await bridge.replyPermission(requestId, 'reject');
  await ctx.reply(`Permiso ${requestId} rechazado.`);
});

bot.onCommand('abort', async (ctx) => {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? 'default');
  const state = getChatState(chatId);

  if (!state.sessionId) {
    await ctx.reply('No hay sesión activa.');
    return;
  }

  await bridge.abort(state.sessionId);
  await ctx.reply('Sesión abortada.');
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  memory.close();
  await bridge.close();
  await bot.stop();
  process.exit(0);
});

try {
  await bot.start();
  console.log('Sammy is running! Press Ctrl+C to stop');
} catch (error) {
  console.error('Failed to start:', error);
  process.exit(1);
}
