import { Bot, Context } from 'grammy';
import type { Config } from '../types/index.js';

export class TelegramBot {
  private bot: Bot;
  private allowedUserIds: Set<number>;

  constructor(config: Config) {
    this.bot = new Bot(config.telegramBotToken);
    this.allowedUserIds = config.telegramAllowedUserIds;
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      if (!ctx.from) {
        await ctx.reply('Unable to identify your account.');
        return;
      }

      const userId = ctx.from.id;

      if (!this.allowedUserIds.has(userId)) {
        console.warn(`Unauthorized access attempt from user ID: ${userId}`);
        await ctx.reply('You are not authorized to use this bot.');
        return;
      }

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

  onCommand(command: string, handler: (ctx: Context) => Promise<void>): void {
    this.bot.command(command, handler);
  }

  async start(): Promise<void> {
    console.log('🤖 Telegram bot starting with long polling...');
    await this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}
