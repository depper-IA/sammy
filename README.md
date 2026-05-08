# Sammy - Personal Virtual Assistant

> Un asistente virtual personal impulsado por agentes de IA, construido con Telegram como interfaz conversacional y OpenCode como motor de ejecución.

## Descripcion

Sammy es un asistente de IA que corre localmente y usa Telegram como interfaz de chat. Diseñado para automatizar tareas, aumentar productividad y actuar como puente entre el usuario y agentes de IA avanzados. Todo el código es abierto y puedes usarlo como base para tu propio asistente personal.

## Caracteristicas Principales

| Caracteristica | Descripcion |
|----------------|-------------|
| Chat Conversacional via Telegram | Interactúa con tu asistente desde cualquier lugar |
| Streaming de Respuestas en Tiempo Real | Ves el progreso mientras el agente trabaja |
| Transcripcion de Audio/Voice Notes | Envía notas de voz y las transcribe automaticamente |
| Agentes de IA Configurables | Usa diferentes agentes según la tarea |
| Persistencia con SQLite | Mantiene contexto entre conversaciones |
| Seguridad con Whitelist | Solo usuarios autorizados pueden interactuar |
| Aprobaciones desde Telegram | Approva o rechaza requests de permisos directamente |
| Deploy en Firebase Functions | Pueder correrlo en la nube o localmente |

## Stack Tecnologico

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat-square&logo=node.js&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=flat-square&logo=telegram&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)

</div>

| Componente | Tecnologia |
|------------|------------|
| Lenguaje | TypeScript |
| Runtime | Node.js |
| Interfaz | Telegram Bot API |
| Motor IA | OpenCode + LLMs (OpenRouter/Groq) |
| Transcripcion | Groq Whisper API |
| Base de datos | SQLite |
| Cloud | Firebase Functions |
| APIs | Telegram Bot API, OpenRouter API |

## Quick Start

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

## Configuracion

Crear archivo `.env` basado en `.env.example`:

```env
# Telegram
TELEGRAM_BOT_TOKEN="tu_bot_token"
TELEGRAM_ALLOWED_USER_IDS="tu_user_id"

# IA / LLM
OPENROUTER_API_KEY="tu_openrouter_key"
OPENROUTER_MODEL="openrouter/llama-3.3-70b-instruct"

# Transcripcion de audio
GROQ_API_KEY="tu_groq_key"

# Configuracion
PROJECT_ROOT="/ruta/a/tu/proyecto"
MAX_AGENT_ITERATIONS=10
MAX_AUDIO_FILE_SIZE_MB=20
DB_PATH="./memory.db"
```

## Comandos Disponibles

| Comando | Descripcion |
|---------|-------------|
| /start | Verificar que el bot está activo |
| /help | Mostrar mensaje de ayuda |
| /agent \<nombre\> | Cambiar el agente de IA |
| /new | Crear nueva sesion |
| /status | Ver estado actual |
| /diff | Ver cambios acumulados |
| /permissions | Listar permisos pendientes |
| /approve \<id\> | Aprobar permiso |
| /reject \<id\> | Rechazar permiso |
| /abort | Abortar ejecucion |

Envía notas de voz o audio y Sammy las transcribe automaticamente.

## Arquitectura

```
sammy/
|-- src/
|   |-- agent/        # Logica de agentes de IA
|   |-- audio/        # Transcripcion de audio
|   |-- bot/          # Bot de Telegram
|   |-- commands/     # Comandos del bot
|   |-- config/       # Cargador de configuracion
|   |-- memory/       # Persistencia SQLite
|   |-- opencode/     # Bridge hacia OpenCode
|   |-- llm/          # Integracion con LLMs
|   |-- sync/         # Sincronizacion de estados
|   |-- tools/        # Herramientas del agente
|   |-- types/        # Tipos TypeScript
|-- functions/        # Firebase Cloud Functions
|-- .env.example
|-- package.json
```

## Deploy en Firebase

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

## Como Funciona

1. **Mensaje llega via Telegram** - Sammy lo recibe
2. **Mapea el chat a una sesion** - Contexto del usuario
3. **Envia el prompt a OpenCode** - Motor de IA
4. **OpenCode ejecuta con sus tools** - Agente trabaja
5. **Respuesta vuelve a Telegram** - Streaming en tiempo real
6. **Permisos solicitados** - Usuario approve/reject desde Telegram

## Presentacion en tu CV

**Como lo presentas:**

> *"Personal AI Assistant - Desarrollé un asistente virtual conversacional que usa Telegram como interfaz y agentes de IA como motor. Implementé streaming de respuestas en tiempo real, transcripcion de audio con Whisper, persistencia de contexto, y deploy en Firebase Functions."*

**Skills que demonstra:**
- TypeScript & Node.js
- Integracion de APIs (Telegram, OpenRouter, Groq)
- Arquitectura de agentes de IA
- Firebase Cloud Functions
- Diseno de interfaces conversacionales
- Persistencia de datos (SQLite)

## Repos Relacionados

- [samwilkie-portfolio](https://github.com/depper-IA/samwilkie-portfolio) - Portfolio personal
- [Lookitry](https://lookitry.com) - SaaS de probador virtual con IA
- [WilkieDevs](https://wilkiedevs.com) - Agencia digital

---

*Creado por [Samuel Wilkie](https://sam.wilkiedevs.com) - Full-Stack Developer & AI Specialist*