import { z } from 'zod';
import { ALERT_TYPES, NOTIF_CHANNELS } from '../constants';

export const alertParamsSchema = z
  .object({
    pricePct: z.number().min(0).max(100).optional(),
    thresholdPct: z.number().min(0).max(100).optional(),
  })
  .default({});

export const alertScopeSchema = z
  .object({
    myProductId: z.string().uuid().optional(),
    competitorProductId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
  })
  .default({});

export const createAlertRuleSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(ALERT_TYPES),
  params: alertParamsSchema,
  scope: alertScopeSchema,
  channels: z.array(z.enum(NOTIF_CHANNELS)).min(1),
  active: z.boolean().default(true),
});
export type CreateAlertRuleInput = z.infer<typeof createAlertRuleSchema>;
