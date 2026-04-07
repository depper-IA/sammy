# Sammy - Telegram Bridge for OpenCode

Sammy runs locally and uses Telegram as the chat interface, with OpenCode as the execution engine.

## Features

- Telegram bot with long polling (no webhook required)
- OpenCode-backed sessions, one per Telegram chat
- **Streaming de respuestas en tiempo real** - ves el progreso mientras OpenCode trabaja
- Uses your existing project config in [`opencode.json`](../opencode.json)
- Reuses your existing OpenCode agents and MCP servers
- Transcribes Telegram voice notes and audio files with Groq Whisper
- Permission approvals from Telegram
- SQLite persistence for chat-to-session mapping
- Whitelist-based security with Telegram user IDs

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
PROJECT_ROOT="C:/ruta/a/tu/proyecto"
MAX_AUDIO_FILE_SIZE_MB=20
```

For local usage with Telegram, no webhook is needed. Sammy runs with long polling.
`PROJECT_ROOT` must point to the same repo where your `.opencode` / `opencode.json` live.

## Telegram Setup

1. Create your bot with BotFather and copy the token.
2. Get your numeric Telegram user ID.
3. Put both values in `.env`.
4. Start Sammy with `npm run dev`.
5. Open Telegram, search your bot, and send `/start`.

If your user ID is not listed in `TELEGRAM_ALLOWED_USER_IDS`, Sammy will reject your messages.
If `PROJECT_ROOT` points to your repo, Sammy will use OpenCode in that repo and inherit its agents, MCP, permissions and project context.
If you send a Telegram `voice` or `audio`, Sammy downloads it, transcribes it with Groq, and forwards the transcript to OpenCode.

## Streaming de Respuestas

Cuando envías un mensaje via Telegram, Sammy ahora muestra el progreso en tiempo real:

1. **Mensaje inicial:** "⏳ Procesando tu solicitud..."
2. **Actualizaciones:** Mientras OpenCode trabaja, Sammy edita el mensaje mostrando:
   - Iteración actual
   - Herramientas usadas (últimas 3)
   - Respuesta parcial (últimos 500 caracteres)
3. **Resultado final:** Cuando termina, Sammy reemplaza el mensaje con "✅ Listo!" seguido del resultado completo

El streaming te permite ver qué está haciendo el agente sin tener que esperar a que termine completamente.

## Commands

- `/start` - Confirm the bot is active
- `/help` - Show help message
- `/agent <nombre>` - Change the OpenCode agent used for this Telegram chat
- `/new` - Create a fresh OpenCode session for this chat
- `/status` - Inspect current session status
- `/diff` - Show the accumulated diff for the current session
- `/permissions` - List pending permission requests
- `/approve <requestId> [once|always]` - Approve a permission request
- `/reject <requestId>` - Reject a permission request
- `/abort` - Abort the current session execution

You can also send audio notes directly. Sammy will transcribe them with Groq and treat the transcript as your prompt.

**Streaming:** Todas las respuestas muestran progreso en tiempo real.

## Architecture

```
sammy/
├── src/
│   ├── bot/         # Telegram bot
│   ├── config/      # Configuration loader
│   ├── memory/      # SQLite persistence
│   ├── opencode/    # OpenCode bridge
│   ├── types/      # TypeScript types
│   └── index.ts    # Entry point
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

## How It Works

1. Telegram message arrives in Sammy.
2. Sammy maps the Telegram chat to an OpenCode session.
3. Sammy sends the prompt to OpenCode in `PROJECT_ROOT`.
4. OpenCode uses its configured agent, tools, MCP servers and repo context.
5. Sammy returns the response to Telegram.
6. If OpenCode requests permissions, you can approve or reject them from Telegram.

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
