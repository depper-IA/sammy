# Sistema de Monitoreo con Notificaciones Telegram

Este sistema monitorea los servicios de Lookitry y te notifica por Telegram cuando hay cambios de estado.

## Servicios Monitoreados

- **Docker containers:** lookitry-frontend, lookitry-backend, root-n8n-1, minio
- **n8n:** Estado del servidor y cantidad de workflows
- **APIs:** api.lookitry.com, lookitry.com

## Paso a Paso

### 1. Crear el bot de Telegram (si no tienes uno)

1. Abre Telegram y busca @BotFather
2. Envía `/newbot`
3. Sigue las instrucciones y guarda el TOKEN
4. Inicia una conversación con tu nuevo bot

### 2. Obtener tu Chat ID

1. Después de crear el bot, inicia conversación con él
2. Envía cualquier mensaje al bot
3. Visita: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
4. Busca tu `chat.id` en la respuesta

### 3. Configurar variables de entorno

En Firebase (o donde deployes las functions):

```bash
TELEGRAM_BOT_TOKEN=tu_token_del_bot
ADMIN_TELEGRAM_CHAT_IDS=tu_chat_id
N8N_API_KEY=tu_key_de_n8n
```

### 4. Deployar la función

```bash
cd sammy/functions
npm run build
firebase deploy --only functions
```

### 5. Verificar estado manualmente

```bash
curl -X POST https://tu-project.firebaseapp.com/checkNow
```

## Cómo funciona

- El scheduler corre cada 5 minutos
- Compara el estado actual con el anterior
- Si hay cambio, envía notificación a Telegram
- Guarda el estado en GCS para persistencia

## Personalizar

### Agregar más containers Docker
Edita `checkDockerContainers()` en `monitor.ts`:

```typescript
const knownContainers = [
  'lookitry-frontend',
  'lookitry-backend',
  'root-n8n-1',
  'minio',
  'tu-nuevo-container',  // <-- Agregar aquí
];
```

### Agregar más URLs a verificar
Edita `checkAPIServices()`:

```typescript
const services = [
  { name: 'api.lookitry.com', url: 'https://api.lookitry.com/health' },
  { name: 'lookitry.com', url: 'https://lookitry.com' },
  { name: 'tu-servicio.com', url: 'https://tu-servicio.com/health' },  // <-- Agregar aquí
];
```

### Cambiar intervalo de verificación
Edita el schedule en `onSchedule`:

```typescript
// Cada 5 minutos (default)
// '*/5 * * * *'

// Otras opciones:
// Cada minuto: '* * * * *'
// Cada 15 minutos: '*/15 * * * *'
// Cada hora: '0 * * * *'
```

## Solución de problemas

### No llegan notificaciones
1. Verifica que el bot esté iniciado (envía "/start" al bot)
2. Verifica que el chat ID sea correcto
3. Revisa los logs de Firebase: `firebase functions:logs`

### Error en Docker check
1. Asegúrate que Docker esté accesible desde la function
2. Revisa que los nombres de containers sean correctos
