import { z } from 'zod';

export const browserAutomationJobTypeSchema = z.enum([
  'competitor_discovery',
  'competitor_scrape',
  'shipment_tracking',
]);

export const jobPrioritySchema = z.enum(['critical', 'high', 'normal', 'low']);

export const jobStatusSchema = z.enum([
  'queued',
  'running',
  'awaiting_user',
  'succeeded',
  'partial',
  'failed',
  'dead_letter',
  'cancelled',
]);

export const automationSettingsSchema = z.object({
  enabled: z.boolean(),
  competitorIntervalMinutes: z
    .number()
    .int()
    .min(60)
    .max(7 * 24 * 60),
  maxConcurrentJobs: z.number().int().min(1).max(4),
});

const basePayloadSchema = z.object({
  inputVersion: z.literal(1),
});

export const competitorScrapePayloadSchema = basePayloadSchema.extend({
  competitorProductId: z.string().uuid(),
  scrapeRunId: z.string().uuid().optional(),
});

export const competitorDiscoveryPayloadSchema = basePayloadSchema.extend({
  storeId: z.string().uuid(),
  discoveryRunId: z.string().uuid().optional(),
});

export const shipmentTrackingPayloadSchema = basePayloadSchema.extend({
  shipmentId: z.string().uuid(),
  trackingNumber: z
    .string()
    .trim()
    .min(4)
    .max(100)
    .regex(/^[A-Za-z0-9._\- ]+$/),
  providerIds: z
    .array(z.enum(['ups', 'postal_ninja', 'parcelsapp', 'ship24', '17track', 'yanwen']))
    .min(1)
    .max(6)
    .optional(),
  manualContinuation: z.boolean().default(true),
  externalShipmentId: z.string().uuid().optional(),
  externalRunId: z.string().uuid().optional(),
});

export const browserAutomationPayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('competitor_scrape'), payload: competitorScrapePayloadSchema }),
  z.object({ type: z.literal('competitor_discovery'), payload: competitorDiscoveryPayloadSchema }),
  z.object({ type: z.literal('shipment_tracking'), payload: shipmentTrackingPayloadSchema }),
]);

export const browserAutomationJobSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  type: browserAutomationJobTypeSchema,
  priority: jobPrioritySchema,
  status: jobStatusSchema,
  payload: z.record(z.unknown()),
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(10),
  leaseToken: z.string().uuid(),
  inputVersion: z.number().int().positive(),
});

export function validateBrowserAutomationPayload(
  type: z.infer<typeof browserAutomationJobTypeSchema>,
  value: unknown,
) {
  switch (type) {
    case 'competitor_scrape':
      return competitorScrapePayloadSchema.parse(value);
    case 'competitor_discovery':
      return competitorDiscoveryPayloadSchema.parse(value);
    case 'shipment_tracking':
      return shipmentTrackingPayloadSchema.parse(value);
    default:
      throw new Error('unsupported_job_type');
  }
}

export type BrowserAutomationJobType = z.infer<typeof browserAutomationJobTypeSchema>;
export type BrowserAutomationJob = z.infer<typeof browserAutomationJobSchema>;
export type ShipmentTrackingPayload = z.infer<typeof shipmentTrackingPayloadSchema>;
export type AutomationSettingsInput = z.infer<typeof automationSettingsSchema>;
