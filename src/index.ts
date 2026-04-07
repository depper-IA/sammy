import { config as dotenvConfig } from 'dotenv';
import { Context } from 'grammy';
import { loadConfig } from './config/index.js';
import { Memory } from './memory/sqlite.js';
import { TelegramBot, type AudioPayload, type ImagePayload } from './bot/index.js';
import { OpenCodeBridge } from './opencode/client.js';
import { transcribeWithGroq, analyzeImageWithOpenRouter } from './audio/groq.js';
import { AgentActivitySync } from './sync/supabase-sync.js';
import { HeartbeatService } from './sync/heartbeat.js';
import { parseSpanishAgentCommand, buildAgentResponse } from './commands/agent-commands.js';

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

// Activity sync service
const activitySync = new AgentActivitySync(
  config.supabaseUrl,
  config.supabaseServiceKey,
  config.supabaseSyncIntervalMs
);
activitySync.start();
console.log(`AgentActivitySync initialized (interval: ${config.supabaseSyncIntervalMs}ms)`);

// Heartbeat service for real-time agent status
const apiBaseUrl = process.env.API_BASE_URL || 'https://api.lookitry.com';
const heartbeat = new HeartbeatService({
  apiBaseUrl,
  agentName: 'Sammy',
  serviceKey: config.supabaseServiceKey,
  intervalMs: 10000, // Every 10 seconds
});
heartbeat.start();
console.log(`[Heartbeat] Service started (10s interval, API: ${apiBaseUrl})`);

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

  // Check for Spanish agent commands
  const parsed = parseSpanishAgentCommand(text);
  if (parsed.command !== 'unknown') {
    await handleAgentCommand(ctx, parsed);
    return;
  }

  const state = await ensureSession(chatId);

  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(ctx.chat!.id, 'typing').catch(() => {});
  }, 3000);

  const startTime = Date.now();
  let activityId: number | null = null;

  try {
    activityId = memory.logActivityStart(
      state.agent,
      'telegram_prompt',
      text.slice(0, 200),
      { chatId, sessionId: state.sessionId }
    );

    const result = await bridge.prompt(
      state,
      text,
      `Telegram ${chatId}`,
      () => {}
    );

    clearInterval(typingInterval);

    const duration = Date.now() - startTime;
    if (activityId) {
      memory.logActivityEnd(activityId, 'success', duration);
      const activity = memory.getRecentActivities(undefined, 1)[0];
      if (activity) activitySync.queueActivity(activity);
    }

    const finalMessage = result.length > 4000 ? `${result.slice(0, 4000)}\n\n(continúa...)` : result;
    await ctx.reply(finalMessage);
  } catch (error) {
    clearInterval(typingInterval);
    const duration = Date.now() - startTime;
    if (activityId) {
      memory.logActivityEnd(activityId, 'failed', duration, (error as Error).message);
      const activity = memory.getRecentActivities(undefined, 1)[0];
      if (activity) activitySync.queueActivity(activity);
    }
    const errorMessage = (error as Error).message;
    await ctx.reply(`❌ Error:\n${errorMessage}`);
  }
});

async function handleAgentCommand(
  ctx: Context,
  parsed: ReturnType<typeof parseSpanishAgentCommand>
): Promise<void> {
  const { command, agentName, dateRange } = parsed;

  switch (command) {
    case 'stats': {
      if (!agentName) {
        await ctx.reply('Especifica el nombre del agente. Ej: /agentstats devguardian');
        return;
      }
      const since = dateRange?.start;
      const stats = memory.getActivityStats(agentName, since);
      const activities = memory.getRecentActivities(agentName, 5);
      await ctx.reply(
        buildAgentResponse(
          { ...parsed, command: 'stats' },
          { agentName, total: stats.total, success: stats.success, failed: stats.failed, avgDuration: stats.avg_duration_ms },
          activities,
          []
        )
      );
      return;
    }

    case 'activity': {
      const activities = memory.getRecentActivities(agentName, 20);
      await ctx.reply(
        buildAgentResponse(
          { ...parsed, command: 'activity' },
          null,
          activities,
          []
        )
      );
      return;
    }

    case 'overview': {
      const allActivities = memory.getRecentActivities(undefined, 100);
      const agentStats: Record<string, { total: number; success: number; failed: number }> = {};
      for (const a of allActivities) {
        if (!agentStats[a.agent_name]) {
          agentStats[a.agent_name] = { total: 0, success: 0, failed: 0 };
        }
        agentStats[a.agent_name].total++;
        if (a.status === 'success') agentStats[a.agent_name].success++;
        if (a.status === 'failed') agentStats[a.agent_name].failed++;
      }
      const lines = ['🤖 Estado de Agentes:'];
      for (const [name, s] of Object.entries(agentStats)) {
        lines.push(`${name}: ${s.total} tasks (✅ ${s.success}, ❌ ${s.failed})`);
      }
      if (lines.length === 1) lines.push('No hay datos de agentes.');
      await ctx.reply(lines.join('\n'));
      return;
    }

    case 'errors': {
      const errors = memory.getRecentErrors(10);
      await ctx.reply(
        buildAgentResponse(
          { ...parsed, command: 'errors' },
          null,
          [],
          errors.map((e) => ({
            task_description: e.task_description ?? e.task_type,
            error_message: e.error_message ?? 'Sin detalles',
            created_at: e.created_at,
          }))
        )
      );
      return;
    }

    case 'report': {
      if (!agentName) {
        const allActivities = memory.getRecentActivities(undefined, 100);
        const total = allActivities.length;
        const success = allActivities.filter((a) => a.status === 'success').length;
        const failed = allActivities.filter((a) => a.status === 'failed').length;
        const avgDuration =
          allActivities.reduce((sum, a) => sum + (a.duration_ms ?? 0), 0) / (total || 1);
        await ctx.reply(
          `📈 Report Global:\nTotal: ${total} | ✅ ${success} | ❌ ${failed}\nDuración promedio: ${Math.round(avgDuration)}ms`
        );
        return;
      }
      const since = dateRange?.start;
      const stats = memory.getActivityStats(agentName, since);
      await ctx.reply(
        `📈 Report para ${agentName}:\nTotal: ${stats.total} | ✅ ${stats.success} | ❌ ${stats.failed}\nDuración promedio: ${Math.round(stats.avg_duration_ms)}ms`
      );
      return;
    }

    case 'dashboard': {
      await ctx.reply('📊 Abriendo dashboard... (funcionalidad en desarrollo)');
      return;
    }

    case 'delegate': {
      const targetAgent = agentName ?? 'build';
      const task = parsed.taskDescription ?? 'realiza una tarea general';
      await ctx.reply(`Delegando a ${targetAgent}: ${task}`);
      return;
    }

    default:
      await ctx.reply('Comando no reconocido. Usa /agents para ver el overview.');
  }
}

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

    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(ctx.chat!.id, 'typing').catch(() => {});
    }, 3000);

    const startTime = Date.now();
    let activityId: number | null = null;

    try {
      activityId = memory.logActivityStart(
        state.agent,
        'telegram_audio',
        `Audio: ${payload.filename}`,
        { chatId, sessionId: state.sessionId }
      );

      const result = await bridge.prompt(
        state,
        prompt,
        `Telegram ${chatId}`,
        () => {}
      );

      clearInterval(typingInterval);

      const duration = Date.now() - startTime;
      if (activityId) {
        memory.logActivityEnd(activityId, 'success', duration);
        const activity = memory.getRecentActivities(undefined, 1)[0];
        if (activity) activitySync.queueActivity(activity);
      }

      await ctx.reply(result);
    } catch (error) {
      clearInterval(typingInterval);
      const duration = Date.now() - startTime;
      if (activityId) {
        memory.logActivityEnd(activityId, 'failed', duration, (error as Error).message);
        const activity = memory.getRecentActivities(undefined, 1)[0];
        if (activity) activitySync.queueActivity(activity);
      }
      const message = (error as Error).message;
      await ctx.reply(`No pude procesar tu audio:\n${message}`);
    }
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

  await ctx.reply('📷 Recibí tu imagen. Analizando con visión...');

  try {
    const imageBuffer = await bot.downloadFile(payload.fileId);
    if (imageBuffer.byteLength > maxBytes) {
      await ctx.reply('La imagen es demasiado grande. Máx 10 MB.');
      return;
    }

    const base64Image = Buffer.from(imageBuffer).toString('base64');

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

    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(ctx.chat!.id, 'typing').catch(() => {});
    }, 3000);

    const startTime = Date.now();
    let activityId: number | null = null;

    try {
      activityId = memory.logActivityStart(
        state.agent,
        'telegram_image',
        `Imagen: ${payload.filename}`,
        { chatId, sessionId: state.sessionId }
      );

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

      const result = await bridge.prompt(
        state,
        prompt,
        `Telegram ${chatId}`,
        () => {}
      );

      clearInterval(typingInterval);

      const duration = Date.now() - startTime;
      if (activityId) {
        memory.logActivityEnd(activityId, 'success', duration);
        const activity = memory.getRecentActivities(undefined, 1)[0];
        if (activity) activitySync.queueActivity(activity);
      }

      await ctx.reply(result);
    } catch (error) {
      clearInterval(typingInterval);
      const duration = Date.now() - startTime;
      if (activityId) {
        memory.logActivityEnd(activityId, 'failed', duration, (error as Error).message);
        const activity = memory.getRecentActivities(undefined, 1)[0];
        if (activity) activitySync.queueActivity(activity);
      }
      const message = (error as Error).message;
      await ctx.reply(`❌ Error al procesar imagen:\n${message}`);
    }
  } catch (error) {
    const message = (error as Error).message;
    await ctx.reply(`❌ Error al procesar imagen:\n${message}`);
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
      `/abort\n` +
      `/agents\n` +
      `/agentstats <nombre>\n` +
      `/agentactivity <nombre>\n` +
      `/agenterros\n\n` +
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
      `/abort - Aborta la sesión activa\n` +
      `/agents - Overview de todos los agentes\n` +
      `/agentstats <nombre> - Stats de agente específico\n` +
      `/agentactivity <nombre> - Actividad reciente\n` +
      `/agenterros - Errores recientes\n\n` +
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

// Agent monitoring commands
bot.onCommand('agents', async (ctx) => {
  const allActivities = memory.getRecentActivities(undefined, 100);
  const agentStats: Record<string, { total: number; success: number; failed: number }> = {};

  for (const a of allActivities) {
    if (!agentStats[a.agent_name]) {
      agentStats[a.agent_name] = { total: 0, success: 0, failed: 0 };
    }
    agentStats[a.agent_name].total++;
    if (a.status === 'success') agentStats[a.agent_name].success++;
    if (a.status === 'failed') agentStats[a.agent_name].failed++;
  }

  const lines = ['🤖 Estado de Agentes:'];
  for (const [name, s] of Object.entries(agentStats)) {
    lines.push(`${name}: ${s.total} tasks (✅ ${s.success}, ❌ ${s.failed})`);
  }
  if (lines.length === 1) {
    lines.push('No hay datos de agentes aún.');
  }
  await ctx.reply(lines.join('\n'));
});

bot.onCommand('agentstats', async (ctx) => {
  const text = ctx.message?.text ?? '';
  const agent = text.replace(/^\/agentstats(@\w+)?\s*/i, '').trim();

  if (!agent) {
    await ctx.reply('Uso: /agentstats <nombre>\nEj: /agentstats devguardian');
    return;
  }

  const stats = memory.getActivityStats(agent);
  await ctx.reply(
    `📊 Stats para ${agent}:\n` +
      `Total: ${stats.total} | ✅ ${stats.success} | ❌ ${stats.failed} | ⏹️ ${stats.cancelled}\n` +
      `Duración promedio: ${Math.round(stats.avg_duration_ms)}ms\n` +
      `Duración total: ${Math.round(stats.total_duration_ms)}ms`
  );
});

bot.onCommand('agentactivity', async (ctx) => {
  const text = ctx.message?.text ?? '';
  const agent = text.replace(/^\/agentactivity(@\w+)?\s*/i, '').trim();
  const agentName = agent || undefined;

  const activities = memory.getRecentActivities(agentName, 10);

  if (activities.length === 0) {
    await ctx.reply(`No hay actividad reciente${agent ? ` para ${agent}` : ''}.`);
    return;
  }

  const lines = [`📋 Actividad reciente${agent ? ` de ${agent}` : ''}:`];
  for (const a of activities) {
    const icon = a.status === 'success' ? '✅' : a.status === 'failed' ? '❌' : '⏳';
    const duration = a.duration_ms ? ` (${a.duration_ms}ms)` : '';
    lines.push(`${icon} ${a.task_type}${duration} - ${a.created_at}`);
  }
  await ctx.reply(lines.join('\n'));
});

bot.onCommand('agenterros', async (ctx) => {
  const errors = memory.getRecentErrors(10);

  if (errors.length === 0) {
    await ctx.reply('✅ No hay errores recientes.');
    return;
  }

  const lines = ['❌ Errores recientes:'];
  for (const e of errors) {
    lines.push(`${e.agent_name}: ${e.task_type}\n  ${e.error_message ?? 'Sin detalles'} (${e.created_at})`);
  }
  await ctx.reply(lines.join('\n\n').slice(0, 3500));
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');

  // Stop heartbeat first
  heartbeat.stop();

  // Sync pending activities before close
  try {
    const result = await activitySync.syncNow();
    console.log(`[Shutdown] Synced ${result.synced} activities, ${result.failed} failed`);
  } catch (err) {
    console.error('[Shutdown] Sync error:', err);
  }

  activitySync.stop();
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
