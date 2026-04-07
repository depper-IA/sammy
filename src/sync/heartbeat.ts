/**
 * Heartbeat service para reportar actividad en tiempo real
 * Envía heartbeats al backend para mostrar agentes activos en el dashboard
 */

interface HeartbeatConfig {
  apiBaseUrl: string;
  agentName: string;
  serviceKey: string;
  intervalMs: number;
}

export class HeartbeatService {
  private config: HeartbeatConfig;
  private interval?: ReturnType<typeof setInterval>;
  private isRegistered = false;
  private currentTaskId?: string;
  private currentTaskDescription?: string;

  constructor(config: HeartbeatConfig) {
    this.config = config;
  }

  /**
   * Registra el agente como activo
   */
  async register(taskId?: string, taskDescription?: string): Promise<void> {
    this.currentTaskId = taskId;
    this.currentTaskDescription = taskDescription;

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/agent/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.serviceKey}`,
        },
        body: JSON.stringify({
          agentName: this.config.agentName,
          status: taskDescription ? 'working' : 'idle',
          taskId: taskId,
          taskDescription: taskDescription,
        }),
      });

      if (response.ok) {
        this.isRegistered = true;
        console.log(`[Heartbeat] Registered agent: ${this.config.agentName}`);
      } else {
        console.error(`[Heartbeat] Failed to register: ${response.status}`);
      }
    } catch (err) {
      console.error('[Heartbeat] Registration error:', err);
    }
  }

  /**
   * Envía heartbeat con estado actual
   */
  async sendHeartbeat(status: 'idle' | 'working' | 'error' = 'idle', taskDescription?: string): Promise<void> {
    if (!this.isRegistered) {
      await this.register(this.currentTaskId, this.currentTaskDescription);
    }

    try {
      await fetch(`${this.config.apiBaseUrl}/api/agent/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.serviceKey}`,
        },
        body: JSON.stringify({
          agentName: this.config.agentName,
          status,
          taskId: this.currentTaskId,
          taskDescription: taskDescription ?? this.currentTaskDescription,
        }),
      });
    } catch (err) {
      console.error('[Heartbeat] Send error:', err);
    }
  }

  /**
   * Inicia envío automático de heartbeats
   */
  start(): void {
    if (this.interval) {
      return; // Ya está corriendo
    }

    console.log(`[Heartbeat] Starting with interval ${this.config.intervalMs}ms`);
    this.interval = setInterval(() => {
      this.sendHeartbeat('working', this.currentTaskDescription).catch((err) => {
        console.error('[Heartbeat] Auto heartbeat error:', err);
      });
    }, this.config.intervalMs);
  }

  /**
   * Detiene el envío automático
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  /**
   * Actualiza la tarea actual
   */
  setCurrentTask(taskId: string | undefined, taskDescription: string | undefined): void {
    this.currentTaskId = taskId;
    this.currentTaskDescription = taskDescription;
  }

  /**
   * Limpia el estado al terminar tarea
   */
  clearTask(): void {
    this.currentTaskId = undefined;
    this.currentTaskDescription = undefined;
    this.sendHeartbeat('idle').catch(() => {});
  }
}
