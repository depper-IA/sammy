# Sammy - Personal AI Agent

A personal AI agent that runs locally with Telegram as the interface.

## Features

- Telegram bot with long polling (no web server required)
- Groq LLM integration (Llama 3.3 70B)
- OpenRouter fallback when Groq rate limit is reached
- Persistent memory with SQLite
- Tool-based agent loop with iteration limits
- Whitelist-based security (Telegram user IDs)
- Modular architecture for easy extension

## Quick Start

```bash
cd sammy
npm install
npm run dev
```

## Configuration

Create a `.env` file based on `.env.example`:

```env
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
TELEGRAM_ALLOWED_USER_IDS="123456789"
GROQ_API_KEY="gsk_your_groq_key"
OPENROUTER_API_KEY="sk-or-v1-your_openrouter_key"
OPENROUTER_MODEL="openrouter/llama-3.3-70b-instruct"
DB_PATH="./memory.db"
MAX_AGENT_ITERATIONS=10
```

## Commands

- `/help` - Show help message
- `/reset` - Clear conversation memory

## Architecture

```
sammy/
├── src/
│   ├── agent/       # Agent loop
│   ├── bot/         # Telegram bot
│   ├── config/      # Configuration loader
│   ├── llm/         # LLM providers (Groq, OpenRouter)
│   ├── memory/      # SQLite persistence
│   ├── tools/      # Tool registry
│   ├── types/      # TypeScript types
│   └── index.ts    # Entry point
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

## Extending Sammy

### Adding Tools

1. Create a new tool in `src/tools/`:
```typescript
export const myTool: Tool = {
  name: 'my_tool',
  description: 'Does something useful',
  execute: async (args) => {
    return { result: 'done' };
  },
};
```

2. Register it in `ToolRegistry` constructor

3. Rebuild - the agent will automatically use the new tool

### Adding LLM Providers

Implement the `LLMProvider` interface and add to the provider list in `src/index.ts`.

### Future Extensions

The architecture supports easy integration of:
- **Firebase Cloud Functions** for cloud deployment (see `functions/`)
- ElevenLabs for text-to-speech
- Whisper for transcription
- Additional Telegram channels
- More LLM providers

## Firebase Deployment

### 1. Renombrar y mover service account

Descarga el JSON, renómbralo a `service-account.json` y ponlo en `sammy/`:

```powershell
# En PowerShell
mv ~/Downloads/tu-archivo-xxxx.json sammy/service-account.json
```

### 2. Configurar variables en Firebase

Desde el CLI de Firebase (en `sammy/`):

```bash
cd sammy
firebase login
firebase functions:config:set \
  telegram.token="YOUR_TELEGRAM_TOKEN" \
  telegram.allowed_ids="1049458877" \
  groq.key="YOUR_GROQ_KEY"
```

### 3. Instalar y desplegar

```bash
cd sammy/functions
npm install
firebase deploy --only functions
```

### 4. Configurar Webhook en Telegram

Después del deploy, Firebase te dará una URL como:
`https://us-central1-tu-proyecto.cloudfunctions.net/webhook`

Escríbele a [@BotFather](https://t.me/botfather) en Telegram:
```
/setdomain
```
Y selecciona tu bot, luego ingresa la URL.

O vía API:
```bash
curl -X POST "https://api.telegram.org/bot8302135250:AAHp2WgNZpjOKVvXjKXWW3MQU9u5nq1z2iM/setWebhook" \
  -d "url=https://us-central1-tu-proyecto.cloudfunctions.net/webhook"
```
