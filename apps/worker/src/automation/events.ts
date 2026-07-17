import { randomUUID } from 'node:crypto';

export type AutomationEventState =
  | 'info'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'recovering';

export interface AutomationEvent {
  id: string;
  occurredAt: string;
  jobType: 'shipment_tracking';
  event: string;
  state: AutomationEventState;
  message: string;
  jobId?: string;
  subjectId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

const MAX_EVENTS = 200;
const events: AutomationEvent[] = [];

function cleanMetadata(value: AutomationEvent['metadata']): AutomationEvent['metadata'] {
  if (!value) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 20)
      .map(([key, entry]) => [
        key.slice(0, 80),
        typeof entry === 'string' ? entry.slice(0, 300) : entry,
      ]),
  );
}

export function emitAutomationEvent(
  input: Omit<AutomationEvent, 'id' | 'occurredAt'>,
): AutomationEvent {
  const event: AutomationEvent = {
    ...input,
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    metadata: cleanMetadata(input.metadata),
  };
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return event;
}

export function listAutomationEvents(input?: {
  after?: string;
  limit?: number;
}): AutomationEvent[] {
  const afterIndex = input?.after ? events.findIndex((event) => event.id === input.after) : -1;
  const limit = Math.min(200, Math.max(1, input?.limit ?? 100));
  return events.slice(afterIndex + 1).slice(-limit);
}
