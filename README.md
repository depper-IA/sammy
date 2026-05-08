# 🤖 Sammy — Personal Virtual Assistant

> Un asistente virtual personal impulsado por agentes de IA, construido con Telegram como interfaz conversacional y OpenCode como motor de ejecución.

## 🎯 Descripción

Sammy es un asistente de IA que corre localmente y usa Telegram como interfaz de chat. Diseñado para automatizar tareas, aumentar productividad y actuar como puente entre el usuario y agentes de IA avanzados. Todo el código es abierto y puedes usarlo como base para tu propio asistente personal.

## ⚡ Características Principales

- **Chat Conversacional via Telegram** — Interactúa con tu asistente desde cualquier lugar
- **Streaming de Respuestas en Tiempo Real** — Ves el progreso mientras el agente trabaja
- **Transcripción de Audio/Voice Notes** — Envía notas de voz y las transcribe automáticamente
- **Agentes de IA Configurables** — Usa diferentes agentes según la tarea
- **Persistencia con SQLite** — Mantiene contexto entre conversaciones
- **Seguridad con Whitelist** — Solo usuarios autorizados pueden interactuar
- **Aprobaciones desde Telegram** — Approva o rechaza requests de permisos directamente
- **Deploy en Firebase Functions** — Pueder correrlo en la nube o localmente

## 🛠️ Stack Tecnológico

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat-square&logo=node.js&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=flat-square&logo=telegram&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)

</div>

- **Lenguaje:** TypeScript
- **Runtime:** Node.js
- **Interfaz:** Telegram Bot API
- **Motor IA:** OpenCode + LLMs (OpenRouter/Groq)
- **Transcripción:** Groq Whisper API
- **Base de datos:** SQLite
- **Cloud:** Firebase Functions
- **APIs:** Telegram Bot API, OpenRouter API

## 🚀 Quick Start

```bash
# Clonar el repositorio
git clone https://github.com/depper-IA/sammy.git
cd sammy

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Ejecutar localmente
npm run dev
```

## ⚙️ Configuración

Crear archivo `.env` basado en `.env.example`:

```env
# Telegram
TELEGRAM_BOT_TOKEN="tu_bot_token"
TELEGRAM_ALLOWED_USER_IDS="tu_user_id"

# IA / LLM
OPENROUTER_API_KEY="tu_openrouter_key"
OPENROUTER_MODEL="openrouter/llama-3.3-70b-instruct"

# Transcripción de audio
GROQ_API_KEY="tu_groq_key"

# Configuración
PROJECT_ROOT="/ruta/a/tu/proyecto"
MAX_AGENT_ITERATIONS=10
MAX_AUDIO_FILE_SIZE_MB=20
DB_PATH="./memory.db"
```

## 📱 Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `/start` | Verificar que el bot está activo |
| `/help` | Mostrar mensaje de ayuda |
| `/agent <nombre>` | Cambiar el agente de IA |
| `/new` | Crear nueva sesión |
| `/status` | Ver estado actual |
| `/diff` | Ver cambios acumulados |
| `/permissions` | Listar permisos pendientes |
| `/approve <id>` | Aprobar permiso |
| `/reject <id>` | Rechazar permiso |
| `/abort` | Abortar ejecución |

Envía notas de voz o audio y Sammy las transcribe automáticamente.

## 🏗️ Arquitectura

```
sammy/
├── src/
│   ├── agent/        # Lógica de agentes de IA
│   ├── audio/        # Transcripción de audio
│   ├── bot/          # Bot de Telegram
│   ├── commands/     # Comandos del bot
│   ├── config/       # Cargador de configuración
│   ├── memory/       # Persistencia SQLite
│   ├── opencode/     # Bridge hacia OpenCode
│   ├── llm/          # Integración con LLMs
│   ├── sync/         # Sincronización de estados
│   ├── tools/        # Herramientas del agente
│   └── types/        # Tipos TypeScript
├── functions/        # Firebase Cloud Functions
├── .env.example
└── package.json
```

## ☁️ Deploy en Firebase

```bash
# Login en Firebase
firebase login

# Configurar variables
firebase functions:config:set \
  telegram.token="tu_token" \
  telegram.allowed_ids="tu_id"

# Deploy
cd functions && npm install
firebase deploy --only functions

# Configurar webhook en Telegram
curl -X POST "https://api.telegram.org/botTU_TOKEN/setWebhook" \
  -d "url=https://tu-proyecto.cloudfunctions.net/webhook"
```

## 💡 Cómo Funciona

1. **Mensaje llega via Telegram** → Sammy lo recibe
2. **Mapea el chat a una sesión** → Contexto del usuario
3. **Envía el prompt a OpenCode** → Motor de IA
4. **OpenCode ejecuta con sus tools** → Agente trabaja
5. **Respuesta vuelve a Telegram** → Streaming en tiempo real
6. **Permisos solicitados** → Usuario approve/reject desde Telegram

## 🎨 Presentación en tu CV

**Cómo lo presentas:**

> *"Personal AI Assistant — Desarrollé un asistente virtual conversacional que usa Telegram como interfaz y agentes de IA como motor. Implementé streaming de respuestas en tiempo real, transcripción de audio con Whisper, persistencia de contexto, y deploy en Firebase Functions."*

**Skills que demuestra:**
- TypeScript & Node.js
- Integración de APIs (Telegram, OpenRouter, Groq)
- Arquitectura de agentes de IA
- Firebase Cloud Functions
- Diseño de interfaces conversacionales
- Persistencia de datos (SQLite)

## 📂 Repos Relacionados

- [samwilkie-portfolio](https://github.com/depper-IA/samwilkie-portfolio) — Portfolio personal
- [Lookitry](https://lookitry.com) — SaaS de probador virtual con IA
- [WilkieDevs](https://wilkiedevs.com) — Agencia digital

---

*Creado por [Samuel Wilkie](https://sam.wilkiedevs.com) — Full-Stack Developer & AI Specialist*
