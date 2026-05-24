import { z } from 'zod';
import {
  DEFAULT_CRAWL_DELAY_SECONDS,
  DEFAULT_CRAWL_FREQUENCY_MINUTES,
  MIN_CRAWL_DELAY_SECONDS,
  SUPPORTED_CURRENCIES,
} from '../constants';

const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

export const createStoreSchema = z.object({
  name: z.string().min(2).max(100),
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(domainRegex, 'Looks like an invalid domain (e.g. shop.example.com).')
    .transform((v) => v.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')),
  countryCode: z.string().length(2).toUpperCase(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  crawlFrequencyMinutes: z
    .number()
    .int()
    .min(60)
    .max(7 * 24 * 60)
    .default(DEFAULT_CRAWL_FREQUENCY_MINUTES),
  crawlDelaySeconds: z
    .number()
    .int()
    .min(MIN_CRAWL_DELAY_SECONDS)
    .max(60)
    .default(DEFAULT_CRAWL_DELAY_SECONDS),
  respectRobots: z.boolean().default(true),
  jsRequired: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = createStoreSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export const scrapingRulesSchema = z.object({
  storeId: z.string().uuid(),
  titleSelector: z.string().max(500).nullish(),
  priceSelector: z.string().max(500).nullish(),
  oldPriceSelector: z.string().max(500).nullish(),
  availabilitySelector: z.string().max(500).nullish(),
  imageSelector: z.string().max(500).nullish(),
  shippingSelector: z.string().max(500).nullish(),
  ratingSelector: z.string().max(500).nullish(),
  priceRegex: z.string().max(200).nullish(),
  useJsonLd: z.boolean().default(true),
  useOpenGraph: z.boolean().default(true),
});
export type ScrapingRulesInput = z.infer<typeof scrapingRulesSchema>;

export const testScrapeSchema = z.object({
  storeId: z.string().uuid(),
  url: z.string().url(),
});
export type TestScrapeInput = z.infer<typeof testScrapeSchema>;
