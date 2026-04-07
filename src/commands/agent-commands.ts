export interface ParsedAgentCommand {
  command: 'stats' | 'activity' | 'overview' | 'errors' | 'report' | 'dashboard' | 'delegate' | 'unknown';
  agentName?: string;
  dateRange?: { start: Date; end: Date };
  taskDescription?: string;
  raw: string;
}

function getDateRange(rangeStr: string): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  switch (rangeStr.toLowerCase()) {
    case 'hoy':
      return { start: today, end: tomorrow };
    case 'ayer':
      return { start: yesterday, end: today };
    case 'esta semana':
    case 'semana':
      return { start: weekStart, end: tomorrow };
    default:
      return { start: today, end: tomorrow };
  }
}

export function parseSpanishAgentCommand(input: string): ParsedAgentCommand {
  const text = input.trim().toLowerCase();

  // "cómo va <agente>" → stats
  const statsMatch = text.match(/^c(?:o|ó)mo\s+va[sz]?\s+(\w+)/);
  if (statsMatch) {
    return {
      command: 'stats',
      agentName: statsMatch[1],
      raw: input,
    };
  }

  // "actividad de <agente> (hoy|ayer|esta semana)" → activity
  const activityMatch = text.match(/^actividad\s+(?:de\s+)?(\w+)?\s*(hoy|ayer|esta\s*semana)?/);
  if (activityMatch && (activityMatch[1] || activityMatch[2])) {
    const agentName = activityMatch[1];
    const rangeStr = activityMatch[2] || 'hoy';
    return {
      command: 'activity',
      agentName: agentName || undefined,
      dateRange: getDateRange(rangeStr),
      raw: input,
    };
  }

  // "qué están haciendo los agentes?" → overview
  if (/qu[eé]\s+est[aán]\s+haciendo\s+(?:los\s+)?agentes/.test(text)) {
    return {
      command: 'overview',
      raw: input,
    };
  }

  // "muéstrame los errores (hoy|ayer)?" → errors
  const errorsMatch = text.match(/mu[eé]strame\s+(?:los\s+)?errores?\s*(hoy|ayer)?/);
  if (errorsMatch) {
    return {
      command: 'errors',
      dateRange: errorsMatch[1] ? getDateRange(errorsMatch[1]) : undefined,
      raw: input,
    };
  }

  // "dame el report de (ayer|hoy|esta semana)" → report
  const reportMatch = text.match(/dame\s+(?:el\s+)?report(?:e)?(?:\s+de)?\s*(hoy|ayer|esta\s*semana)?/);
  if (reportMatch) {
    return {
      command: 'report',
      dateRange: reportMatch[1] ? getDateRange(reportMatch[1]) : getDateRange('hoy'),
      raw: input,
    };
  }

  // "cómo vamos (esta semana|hoy)?" → report
  const reportMatch2 = text.match(/c(?:o|ó)mo\s+vamos\s*(esta\s*semana|hoy)?/);
  if (reportMatch2) {
    return {
      command: 'report',
      dateRange: reportMatch2[1] ? getDateRange(reportMatch2[1]) : getDateRange('hoy'),
      raw: input,
    };
  }

  // "crea un dashboard" / "ver dashboard" → dashboard
  if (/dashboard|tablero|panel/gi.test(text)) {
    return {
      command: 'dashboard',
      raw: input,
    };
  }

  // "delegate" commands
  const delegateMatch = text.match(/^delega(?:r|te)?(?:\s+al?\s+)?(\w+)?\s*(.+)?/);
  if (delegateMatch && (delegateMatch[1] || delegateMatch[2])) {
    return {
      command: 'delegate',
      agentName: delegateMatch[1] || undefined,
      taskDescription: delegateMatch[2] || undefined,
      raw: input,
    };
  }

  return {
    command: 'unknown',
    raw: input,
  };
}

export function buildAgentResponse(
  parsed: ParsedAgentCommand,
  stats: {
    agentName: string;
    total: number;
    success: number;
    failed: number;
    avgDuration: number;
  } | null,
  activities: Array<{
    task_type: string;
    status: string;
    created_at: string;
    duration_ms: number | null;
  }>,
  errors: Array<{
    task_description: string;
    error_message: string;
    created_at: string;
  }>
): string {
  switch (parsed.command) {
    case 'stats':
      if (!stats || !parsed.agentName) {
        return 'No hay estadísticas disponibles para ese agente.';
      }
      return [
        `📊 Stats para ${parsed.agentName}:`,
        `Total: ${stats.total} | ✅ ${stats.success} | ❌ ${stats.failed}`,
        `Duración promedio: ${Math.round(stats.avgDuration)}ms`,
      ].join('\n');

    case 'activity':
      if (activities.length === 0) {
        return 'No hay actividad reciente.';
      }
      return [
        `📋 Actividad reciente${parsed.agentName ? ` de ${parsed.agentName}` : ''}:`,
        ...activities.slice(0, 5).map(
          (a) =>
            `• ${a.task_type} [${a.status}] - ${a.created_at}${a.duration_ms ? ` (${a.duration_ms}ms)` : ''}`
        ),
      ].join('\n');

    case 'overview':
      return [
        '🤖 Estado de Agentes:',
        ...(stats
          ? [`${stats.agentName}: ${stats.total} tasks (${stats.success} ✅, ${stats.failed} ❌)`]
          : ['No hay datos de agentes.']),
      ].join('\n');

    case 'errors':
      if (errors.length === 0) {
        return '✅ No hay errores recientes.';
      }
      return [
        '❌ Errores recientes:',
        ...errors.slice(0, 5).map(
          (e) => `${e.task_description}: ${e.error_message} (${e.created_at})`
        ),
      ].join('\n');

    case 'report':
      return [
        '📈 Report:',
        stats
          ? [
              `Agente: ${stats.agentName}`,
              `Total: ${stats.total} | ✅ ${stats.success} | ❌ ${stats.failed}`,
              `Duración promedio: ${Math.round(stats.avgDuration)}ms`,
            ].join('\n')
          : 'No hay datos para el período seleccionado.',
      ].join('\n');

    case 'dashboard':
      return 'Abriendo dashboard... (funcionalidad en desarrollo)';

    case 'delegate':
      return `Delegando${parsed.agentName ? ` a ${parsed.agentName}` : ''}...`;

    default:
      return 'No entendí el comando. Usa /agents para ver el overview.';
  }
}
