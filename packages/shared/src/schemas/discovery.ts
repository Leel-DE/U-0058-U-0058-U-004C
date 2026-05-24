import { z } from 'zod';

const patternList = z.preprocess(
  (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  },
  z.array(z.string().min(1).max(300)).max(50),
);

export const discoveryStartSchema = z.object({
  storeId: z.string().uuid(),
  startUrl: z.string().url(),
  maxPages: z.number().int().min(1).max(5000).default(300),
  maxProducts: z.number().int().min(1).max(50000).default(2000),
  crawlDepth: z.number().int().min(0).max(8).default(4),
  maxPagesPerCategory: z.number().int().min(1).max(100).default(20),
  maxScrollIterations: z.number().int().min(0).max(30).default(10),
  concurrency: z.number().int().min(1).max(3).default(1),
  mode: z.enum(['category_scan', 'detail_enrichment']).default('category_scan'),
  respectRobotsTxt: z.boolean().default(true),
  useAi: z.boolean().default(false),
  useManualCaptcha: z.boolean().default(true),
  includePatterns: patternList.default([]),
  excludePatterns: patternList.default([]),
  domainAllowlist: patternList.default([]),
  discoveryPreset: z.enum(['quick', 'normal', 'deep', 'full', 'custom']).optional(),
});
export type DiscoveryStartInput = z.infer<typeof discoveryStartSchema>;

export const discoveryRunControlSchema = z.object({
  storeId: z.string().uuid(),
  runId: z.string().uuid(),
});
export type DiscoveryRunControlInput = z.infer<typeof discoveryRunControlSchema>;

export const discoverySaveProductsSchema = z.object({
  storeId: z.string().uuid(),
  runId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).optional(),
  saveAllValid: z.boolean().default(false),
});
export type DiscoverySaveProductsInput = z.infer<typeof discoverySaveProductsSchema>;
