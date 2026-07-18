import { z } from 'zod';
import {
  CRAWL_PRESETS,
  DEFAULT_CRAWL_DELAY_SECONDS,
  DEFAULT_CRAWL_FREQUENCY_MINUTES,
  MIN_CRAWL_DELAY_SECONDS,
  SUPPORTED_CURRENCIES,
} from '../constants.js';

const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

/** Strip protocol/path and lowercase BEFORE validating the regex, so a paste
 *  of `https://Shop.Example.com/x` resolves to `shop.example.com`. */
const domainField = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
          .trim()
      : v,
  z
    .string()
    .min(3)
    .max(255)
    .regex(domainRegex, 'Looks like an invalid domain (e.g. shop.example.com).'),
);

export const createStoreSchema = z.object({
  name: z.string().min(2).max(100),
  domain: domainField,
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
  brandSelector: z.string().max(500).nullish(),
  skuSelector: z.string().max(500).nullish(),
  breadcrumbsSelector: z.string().max(500).nullish(),
  productCardSelector: z.string().max(500).nullish(),
  cardTitleSelector: z.string().max(500).nullish(),
  cardPriceSelector: z.string().max(500).nullish(),
  cardOldPriceSelector: z.string().max(500).nullish(),
  cardImageSelector: z.string().max(500).nullish(),
  cardLinkSelector: z.string().max(500).nullish(),
  cardAvailabilitySelector: z.string().max(500).nullish(),
  paginationNextSelector: z.string().max(500).nullish(),
  loadMoreSelector: z.string().max(500).nullish(),
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

export const autoDetectScrapeSchema = z.object({
  storeId: z.string().uuid(),
  url: z.string().url(),
  pageType: z.enum(['product', 'category']).default('product'),
});
export type AutoDetectScrapeInput = z.infer<typeof autoDetectScrapeSchema>;

export const detectBaseSelectorsSchema = z.object({
  competitorId: z.string().uuid(),
  homepageUrl: z.string().url(),
  productUrl: z.string().url().optional().or(z.literal('')),
  categoryUrl: z.string().url().optional().or(z.literal('')),
  useAi: z.boolean().default(false),
});
export type DetectBaseSelectorsInput = z.infer<typeof detectBaseSelectorsSchema>;

export const analyzeStoreSchema = z.object({
  homepageUrl: z.string().url(),
  useAi: z.boolean().default(false),
});
export type AnalyzeStoreInput = z.infer<typeof analyzeStoreSchema>;

const selectorField = z.string().max(500).nullish();
const partialRulesPayloadSchema = z.object({
  titleSelector: selectorField,
  priceSelector: selectorField,
  oldPriceSelector: selectorField,
  availabilitySelector: selectorField,
  imageSelector: selectorField,
  brandSelector: selectorField,
  skuSelector: selectorField,
  breadcrumbsSelector: selectorField,
  productCardSelector: selectorField,
  cardTitleSelector: selectorField,
  cardPriceSelector: selectorField,
  cardOldPriceSelector: selectorField,
  cardImageSelector: selectorField,
  cardLinkSelector: selectorField,
  cardAvailabilitySelector: selectorField,
  paginationNextSelector: selectorField,
  loadMoreSelector: selectorField,
  priceRegex: z.string().max(200).nullish(),
  useJsonLd: z.boolean().default(true),
  useOpenGraph: z.boolean().default(true),
});

export const createAnalyzedStoreSchema = z.object({
  store: z.object({
    name: z.string().min(2).max(100),
    domain: domainField,
    countryCode: z.string().length(2).toUpperCase(),
    currency: z.enum(SUPPORTED_CURRENCIES),
    homepageUrl: z.string().url(),
  }),
  selectors: z.object({
    productSelectors: partialRulesPayloadSchema.partial().default({}),
    categorySelectors: partialRulesPayloadSchema.partial().default({}),
  }),
  recommendedSettings: z.object({
    crawlPreset: z.enum(CRAWL_PRESETS).default('balanced'),
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
    useManualCaptcha: z.boolean().default(false),
    useAi: z.boolean().default(false),
    discoveryPreset: z.enum(['quick', 'normal', 'deep', 'full']).default('normal'),
    discoveryDefaultsJson: z.record(z.unknown()).default({}),
  }),
  profile: z.object({
    framework: z.string().max(80),
    renderingStrategy: z.string().max(80),
    scrapeDifficulty: z.string().max(40),
    antiBotRisk: z.string().max(40),
    recommendedMode: z.string().max(80),
    detectionConfidence: z.number().min(0).max(1),
    autoDetectedSettingsJson: z.record(z.unknown()).default({}),
  }),
  notes: z.string().max(1000).optional(),
});
export type CreateAnalyzedStoreInput = z.infer<typeof createAnalyzedStoreSchema>;

export const manualSessionStartSchema = z.object({
  storeId: z.string().uuid(),
  url: z.string().url(),
});
export type ManualSessionStartInput = z.infer<typeof manualSessionStartSchema>;

export const manualSessionContinueSchema = z.object({
  storeId: z.string().uuid(),
  sessionId: z.string().uuid(),
});
export type ManualSessionContinueInput = z.infer<typeof manualSessionContinueSchema>;
