import { z } from 'zod';
import { AVAILABILITY, MAX_PRICE, SUPPORTED_CURRENCIES } from '../constants';

export const createMyProductSchema = z.object({
  sku: z.string().min(1).max(100),
  gtin: z.string().max(20).optional(),
  brand: z.string().max(100).optional(),
  name: z.string().min(2).max(500),
  myPrice: z.number().positive().max(MAX_PRICE).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  url: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  categoryId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateMyProductInput = z.infer<typeof createMyProductSchema>;

export const updateMyProductSchema = createMyProductSchema.partial().extend({
  id: z.string().uuid(),
});

export const createCompetitorProductSchema = z.object({
  storeId: z.string().uuid(),
  url: z.string().url(),
  externalId: z.string().max(200).optional(),
  initialTitle: z.string().max(500).optional(),
});
export type CreateCompetitorProductInput = z.infer<typeof createCompetitorProductSchema>;

export const manualSnapshotSchema = z.object({
  competitorProductId: z.string().uuid(),
  price: z.number().positive().max(MAX_PRICE),
  oldPrice: z.number().positive().max(MAX_PRICE).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  availability: z.enum(AVAILABILITY).default('unknown'),
  note: z.string().max(500).optional(),
});
export type ManualSnapshotInput = z.infer<typeof manualSnapshotSchema>;

export const confirmMatchSchema = z.object({
  matchId: z.string().uuid(),
});
export const createMatchSchema = z.object({
  myProductId: z.string().uuid(),
  competitorProductId: z.string().uuid(),
});
