import type { ActivityLog } from '../memory/sqlite.js';

interface AgentActivity {
  agent_name: string;
  task_type: string;
  task_description: string | null;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  finished_at: string | null;
}

export class AgentActivitySync {
  private supabaseUrl: string;
  private supabaseKey: string;
  private syncIntervalMs: number;
  private interval?: ReturnType<typeof setInterval>;
  private pendingQueue: ActivityLog[] = [];
  private isSyncing = false;
  private enabled: boolean;

  constructor(supabaseUrl: string, supabaseKey: string, syncIntervalMs = 30000) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.syncIntervalMs = syncIntervalMs;
    this.enabled = Boolean(supabaseUrl && supabaseKey);
  }

  start(): void {
    if (!this.enabled) {
      console.log('[AgentActivitySync] Disabled - no Supabase credentials');
      return;
    }

    console.log(`[AgentActivitySync] Starting with interval ${this.syncIntervalMs}ms`);
    this.interval = setInterval(() => {
      this.syncToSupabase().catch((err) => {
        console.error('[AgentActivitySync] Sync error:', err.message);
      });
    }, this.syncIntervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  queueActivity(activity: ActivityLog): void {
    if (!this.enabled) return;
    this.pendingQueue.push(activity);
  }

  async syncNow(): Promise<{ synced: number; failed: number }> {
    if (!this.enabled) {
      return { synced: 0, failed: 0 };
    }

    return this.syncToSupabase();
  }

  private async syncToSupabase(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing || this.pendingQueue.length === 0) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    let synced = 0;
    let failed = 0;

    try {
      const queue = [...this.pendingQueue];
      this.pendingQueue = [];

      for (const activity of queue) {
        try {
          if (activity.status === 'running') {
            const id = await this.postActivity({
              agent_name: activity.agent_name,
              task_type: activity.task_type,
              task_description: activity.task_description,
              status: activity.status,
              duration_ms: null,
              error_message: null,
              metadata: activity.metadata,
              created_at: activity.created_at,
              finished_at: null,
            });
            console.log(`[AgentActivitySync] Posted activity ${id}`);
            synced++;
          } else {
            await this.putActivityEnd(
              activity.id.toString(),
              activity.status,
              activity.duration_ms ?? 0,
              activity.error_message ?? undefined
            );
            console.log(`[AgentActivitySync] Updated activity ${activity.id}`);
            synced++;
          }
        } catch (err) {
          console.error(`[AgentActivitySync] Failed to sync activity ${activity.id}:`, err);
          this.pendingQueue.push(activity);
          failed++;
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return { synced, failed };
  }

  private async postActivity(activity: Omit<AgentActivity, never>): Promise<string> {
    // Use backend API URL (api.lookitry.com) not Supabase URL directly
    const apiBase = process.env.API_BASE_URL || 'https://api.lookitry.com';
    const response = await fetch(`${apiBase}/api/agent/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.supabaseKey}`,
      },
      body: JSON.stringify(activity),
    });

    if (!response.ok) {
      throw new Error(`POST /api/agent/activity failed: ${response.status}`);
    }

    const data = (await response.json()) as { id?: string };
    return data.id ?? '';
  }

  private async putActivityEnd(
    id: string,
    status: string,
    durationMs: number,
    errorMessage?: string
  ): Promise<void> {
    const apiBase = process.env.API_BASE_URL || 'https://api.lookitry.com';
    const response = await fetch(`${apiBase}/api/agent/activity/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.supabaseKey}`,
      },
      body: JSON.stringify({ status, duration_ms: durationMs, error_message: errorMessage }),
    });

    if (!response.ok) {
      throw new Error(`PUT /api/agent/activity/${id} failed: ${response.status}`);
    }
  }
}
