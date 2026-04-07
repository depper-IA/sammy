import { Bot, Context } from 'grammy';
import type { Config } from '../types/index.js';

export type AudioPayload = {
  fileId: string;
  filename: string;
  mimeType: string;
  kind: 'voice' | 'audio';
  duration?: number;
  fileSize?: number;
};

export type ImagePayload = {
  fileId: string;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  fileSize?: number;
};

export class TelegramBot {
  private bot: Bot;
  private token: string;
  private allowedUserIds: Set<number>;

  constructor(config: Config) {
    this.bot = new Bot(config.telegramBotToken);
    this.token = config.telegramBotToken;
    this.allowedUserIds = config.telegramAllowedUserIds;
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      console.log(`[DEBUG] Message received from user: ${ctx.from?.id}, chat: ${ctx.chat?.id}`);

      if (!ctx.from) {
        console.log('[DEBUG] No from field, rejecting');
        await ctx.reply('Unable to identify your account.');
        return;
      }

      const userId = ctx.from.id;
      console.log(`[DEBUG] User ID: ${userId}, Allowed: ${[...this.allowedUserIds]}`);

      if (!this.allowedUserIds.has(userId)) {
        console.warn(`Unauthorized access attempt from user ID: ${userId}`);
        await ctx.reply('You are not authorized to use this bot.');
        return;
      }

      console.log('[DEBUG] User authorized, proceeding');
      await next();
    });
  }

  onText(handler: (ctx: Context, text: string) => Promise<void>): void {
    this.bot.on('message:text', async (ctx) => {
      const text = ctx.message.text;
      if (text && !text.startsWith('/')) {
        await handler(ctx as Context, text);
      }
    });
  }

  onAudio(handler: (ctx: Context, payload: AudioPayload) => Promise<void>): void {
    this.bot.on(['message:voice', 'message:audio'], async (ctx) => {
      const isVoice = 'voice' in ctx.message && ctx.message.voice;
      const isAudio = 'audio' in ctx.message && ctx.message.audio;
      console.log(`[DEBUG] Audio/voice message received: voice=${isVoice}, audio=${isAudio}`);
      if (isVoice && ctx.message.voice) {
        await handler(ctx as Context, {
          fileId: ctx.message.voice.file_id,
          filename: `voice-${ctx.message.voice.file_unique_id}.ogg`,
          mimeType: ctx.message.voice.mime_type || 'audio/ogg',
          kind: 'voice',
          duration: ctx.message.voice.duration,
          fileSize: ctx.message.voice.file_size,
        });
        return;
      }

      if (isAudio && ctx.message.audio) {
        await handler(ctx as Context, {
          fileId: ctx.message.audio.file_id,
          filename: ctx.message.audio.file_name || `audio-${ctx.message.audio.file_unique_id}.mp3`,
          mimeType: (ctx.message.audio as any).file_mime_type || 'audio/mpeg',
          kind: 'audio',
          duration: ctx.message.audio.duration,
          fileSize: ctx.message.audio.file_size,
        });
      }
    });
  }

  onPhoto(handler: (ctx: Context, payload: ImagePayload) => Promise<void>): void {
    this.bot.on('message:photo', async (ctx) => {
      const photo = ctx.message.photo;
      if (!photo || photo.length === 0) return;
      const largestPhoto = photo[photo.length - 1];
      console.log(`[DEBUG] Photo received: width=${largestPhoto.width}, height=${largestPhoto.height}`);
      await handler(ctx as Context, {
        fileId: largestPhoto.file_id,
        filename: `photo-${largestPhoto.file_unique_id}.jpg`,
        mimeType: 'image/jpeg',
        width: largestPhoto.width,
        height: largestPhoto.height,
        fileSize: largestPhoto.file_size,
      });
    });
  }

  onCommand(command: string, handler: (ctx: Context) => Promise<void>): void {
    this.bot.command(command, handler);
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    const file = await this.bot.api.getFile(fileId);
    if (!file.file_path) {
      throw new Error('Telegram no devolvió file_path para el archivo.');
    }

    const fileUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar el archivo desde Telegram (${response.status}).`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async start(): Promise<void> {
    console.log('Telegram bot starting with long polling...');
    await this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}
