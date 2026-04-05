import { config as dotenvConfig } from 'dotenv';
import { loadConfig } from './config/index.js';
import { Memory } from './memory/sqlite.js';
import { GroqProvider, OpenRouterProvider, LLMManager, type LLMProvider } from './llm/index.js';
import { ToolRegistry } from './tools/index.js';
import { Agent } from './agent/index.js';
import { TelegramBot } from './bot/index.js';

dotenvConfig();

console.log('Starting Sammy...');

const config = loadConfig();
console.log(`Config loaded. Allowed users: ${config.telegramAllowedUserIds.size}`);

const memory = new Memory(config.dbPath);
console.log(`Memory initialized at ${config.dbPath}`);

const groqProvider = new GroqProvider(config.groqApiKey);
const providers: LLMProvider[] = [groqProvider];

if (config.openrouterApiKey) {
  const openrouterProvider = new OpenRouterProvider(config.openrouterApiKey, config.openrouterModel);
  providers.push(openrouterProvider);
  console.log('OpenRouter fallback enabled');
}

const llm = new LLMManager(providers);
const tools = new ToolRegistry();
const agent = new Agent(llm, tools, memory, config.maxAgentIterations);

console.log(`Max agent iterations: ${config.maxAgentIterations}`);

const bot = new TelegramBot(config);

bot.onText(async (ctx, text) => {
  console.log(`Received: ${text}`);

  try {
    const response = await agent.run(text);
    await ctx.reply(response);
    console.log(`Sent response`);
  } catch (error) {
    console.error('Agent error:', error);
    await ctx.reply('I encountered an error processing your request.');
  }
});

bot.onCommand('reset', async (ctx) => {
  memory.clearMessages();
  await ctx.reply('Memory cleared. Starting fresh!');
});

bot.onCommand('help', async (ctx) => {
  await ctx.reply(
    `Sammy - Your Personal AI Agent\n\n` +
    `Commands:\n` +
    `/help - Show this message\n` +
    `/reset - Clear conversation memory\n\n` +
    `Just send me a message and I'll respond!`
  );
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  memory.close();
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
