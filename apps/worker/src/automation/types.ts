import type { BrowserContext, Page } from 'playwright';
import type { BrowserAutomationJob } from '@cr/shared';

export interface RuntimeLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  message: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface JobExecutionContext {
  job: BrowserAutomationJob;
  browserContext: BrowserContext;
  log(entry: RuntimeLogEntry): Promise<void>;
  heartbeat(progress?: Record<string, unknown>): Promise<void>;
  signal: AbortSignal;
}

export interface BrowserJobResult {
  status: 'succeeded' | 'partial' | 'awaiting_user';
  result: Record<string, unknown>;
  nextCheckAt?: Date;
}

export type BrowserJobHandler = (context: JobExecutionContext) => Promise<BrowserJobResult>;

export interface PagePreparationResult {
  captchaDetected: boolean;
  captchaKind?: string;
  dismissed: string[];
}

export interface TrackingProviderAdapter {
  readonly id: 'ups' | 'postal_ninja' | 'parcelsapp' | 'ship24' | '17track' | 'yanwen';
  readonly label: string;
  buildUrl(trackingNumber: string): URL;
  waitForResult(page: Page): Promise<void>;
  extract(page: Page, trackingNumber: string): Promise<unknown>;
}
