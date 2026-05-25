export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function createRequestId(prefix = 'req'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function logStructured(input: {
  service: string;
  level: LogLevel;
  requestId?: string;
  category?: string;
  event: string;
  durationMs?: number;
  error?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...input,
  });
  if (input.level === 'error') console.error(line);
  else if (input.level === 'warn') console.warn(line);
  else console.log(line);
}
