#!/usr/bin/env node

import * as https from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Telegraf } from 'telegraf';

const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  adminChatIds: (process.env.ADMIN_TELEGRAM_CHAT_IDS ?? '1049458877')
    .split(',')
    .map((id) => id.trim()),
  checkInterval: process.env.CHECK_INTERVAL ?? '*/5 * * * *',
};

const bot = new Telegraf(config.telegramBotToken);

const stateFile = '/tmp/monitor_state.json';

interface ServiceStatus {
  name: string;
  status: 'up' | 'down' | 'unknown';
  lastCheck: string;
  lastChange?: string;
}

interface MonitorState {
  services: Record<string, ServiceStatus>;
}

async function loadState(): Promise<MonitorState> {
  try {
    const response = await fetch(`https://storage.googleapis${stateFile.replace('/tmp', '')}/monitor_state.json`);
    if (response.ok) {
      return await response.json();
    }
  } catch {}
  return { services: {} };
}

async function saveState(state: MonitorState): Promise<void> {
  try {
    const stateJson = JSON.stringify(state);
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();
    await storage.bucket('YOUR_BUCKET_NAME').file('monitor_state.json').save(stateJson);
  } catch (e) {
    console.log('Could not save to GCS, using memory only');
  }
}

async function checkDockerContainers(): Promise<Record<string, ServiceStatus>> {
  const result: Record<string, ServiceStatus> = {};
  
  try {
    const process = Deno.run({
      cmd: ['docker', 'ps', '--format', '{{.Names}}|{{.Status}}'],
      stdout: 'piped',
    });
    const output = new TextDecoder().decode(await process.output());
    await process.close();
    
    const containers = output.trim().split('\n').filter(Boolean);
    const runningContainers = containers.map(c => c.split('|')[0]);
    
    const knownContainers = ['lookitry-frontend', 'lookitry-backend', 'root-n8n-1', 'minio'];
    
    for (const name of knownContainers) {
      result[name] = {
        name,
        status: runningContainers.includes(name) ? 'up' : 'down',
        lastCheck: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.error('Docker check failed:', e);
  }
  
  return result;
}

async function checkN8nWorkflows(): Promise<Record<string, ServiceStatus>> {
  const result: Record<string, ServiceStatus> = {};
  
  try {
    const response = await fetch('https://n8n.wilkiedevs.com/rest/workflows', {
      headers: { 'N8N_TOKEN': process.env.N8N_API_KEY ?? '' },
    });
    
    if (response.ok) {
      const workflows = await response.json();
      result['n8n'] = {
        name: 'n8n',
        status: 'up',
        lastCheck: new Date().toISOString(),
      };
      result['workflows_count'] = {
        name: `workflows: ${workflows.length}`,
        status: 'up',
        lastCheck: new Date().toISOString(),
      };
    } else {
      result['n8n'] = {
        name: 'n8n',
        status: 'down',
        lastCheck: new Date().toISOString(),
      };
    }
  } catch (e) {
    result['n8n'] = {
      name: 'n8n',
      status: 'down',
      lastCheck: new Date().toISOString(),
    };
  }
  
  return result;
}

async function checkAPIServices(): Promise<Record<string, ServiceStatus>> {
  const result: Record<string, ServiceStatus> = {};
  
  const services = [
    { name: 'api.lookitry.com', url: 'https://api.lookitry.com/health' },
    { name: 'lookitry.com', url: 'https://lookitry.com' },
  ];
  
  for (const svc of services) {
    try {
      const response = await fetch(svc.url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      result[svc.name] = {
        name: svc.name,
        status: response.ok ? 'up' : 'down',
        lastCheck: new Date().toISOString(),
      };
    } catch {
      result[svc.name] = {
        name: svc.name,
        status: 'down',
        lastCheck: new Date().toISOString(),
      };
    }
  }
  
  return result;
}

async function checkAllServices(): Promise<Record<string, ServiceStatus>> {
  const all = {
    ...await checkDockerContainers(),
    ...await checkN8nWorkflows(),
    ...await checkAPIServices(),
  };
  return all;
}

function formatStatusChange(oldStatus: ServiceStatus, newStatus: ServiceStatus): string {
  const emoji = newStatus.status === 'up' ? '🟢' : '🔴';
  const time = new Date().toLocaleString('es-CO');
  
  if (oldStatus.status === 'unknown') {
    return `${emoji} ${newStatus.name}: ${newStatus.status.toUpperCase()} (${time})`;
  }
  
  if (oldStatus.status !== newStatus.status) {
    return `${emoji} ${newStatus.name}: ${oldStatus.status.toUpperCase()} → ${newStatus.status.toUpperCase()} (${time})`;
  }
  
  return '';
}

async function sendNotification(message: string): Promise<void> {
  if (!message) return;
  
  for (const chatId of config.adminChatIds) {
    try {
      await bot.telegram.sendMessage(chatId, message);
    } catch (e) {
      console.error(`Failed to send to ${chatId}:`, e);
    }
  }
}

export const monitorServices = onSchedule(
  { schedule: '*/5 * * * *', timeout: '60s', memory: '256MiB' },
  async () => {
    const currentState = await checkAllServices();
    const previousState = await loadState();
    
    const notifications: string[] = [];
    
    for (const [name, status] of Object.entries(currentState)) {
      const previous = previousState.services[name];
      
      if (!previous || previous.status !== status.status) {
        const msg = formatStatusChange(previous || status, status);
        if (msg) notifications.push(msg);
      }
      
      previousState.services[name] = status;
    }
    
    if (notifications.length > 0) {
      await sendNotification(notifications.join('\n'));
    }
    
    await saveState(previousState);
  }
);

export const checkNow = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  
  const currentState = await checkAllServices();
  const message = Object.values(currentState)
    .map(s => `${s.status === 'up' ? '🟢' : '🔴'} ${s.name}: ${s.status.toUpperCase()}`)
    .join('\n');
  
  await sendNotification(`Estado actual:\n${message}`);
  res.status(200).json({ ok: true, status: currentState });
});
