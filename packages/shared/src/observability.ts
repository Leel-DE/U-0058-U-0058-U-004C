export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'scraping'
  | 'discovery'
  | 'ai'
  | 'selector_repair'
  | 'exports'
  | 'db'
  | 'worker'
  | 'jobs'
  | 'alerts'
  | 'captcha_manual'
  | 'analytics'
  | 'health';

export interface StructuredError {
  name?: string;
  message: string;
  stack?: string;
  code?: string;
}

export interface StructuredLog {
  timestamp: string;
  service: string;
  level: LogLevel;
  requestId?: string;
  discoveryRunId?: string;
  scrapeJobId?: string;
  competitorId?: string;
  productId?: string;
  category?: LogCategory;
  event: string;
  durationMs?: number;
  error?: StructuredError;
  metadata?: Record<string, unknown>;
}

export function createRequestId(prefix = 'req'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

export function errorToLog(error: unknown): StructuredError {
  if (error instanceof Error) {
    const maybeCode = error as Error & { code?: string };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: maybeCode.code,
    };
  }
  return { message: String(error) };
}

export function logStructured(input: Omit<StructuredLog, 'timestamp'> & { timestamp?: string }) {
  const log: StructuredLog = {
    timestamp: input.timestamp ?? new Date().toISOString(),
    service: input.service,
    level: input.level,
    requestId: input.requestId,
    discoveryRunId: input.discoveryRunId,
    scrapeJobId: input.scrapeJobId,
    competitorId: input.competitorId,
    productId: input.productId,
    category: input.category,
    event: input.event,
    durationMs: input.durationMs,
    error: input.error,
    metadata: input.metadata,
  };
  const line = JSON.stringify(log);
  if (input.level === 'error') console.error(line);
  else if (input.level === 'warn') console.warn(line);
  else console.log(line);
}
