import { z } from 'zod';
import { SCRAPE_STRATEGY, SNAPSHOT_STATUS, SUPPORTED_CURRENCIES, AVAILABILITY } from '../constants';

export const extractedProductSchema = z.object({
  title: z.string().min(1).max(1000).optional(),
  price: z.number().nonnegative().max(1_000_000).optional(),
  oldPrice: z.number().nonnegative().max(1_000_000).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  availability: z.enum(AVAILABILITY).optional(),
  image: z.string().url().optional(),
  shipping: z.string().max(500).optional(),
  rating: z.number().min(0).max(5).optional(),
});
export type ExtractedProductPayload = z.infer<typeof extractedProductSchema>;

export const scrapeRequestSchema = z.object({
  url: z.string().url(),
  strategy: z.enum([...SCRAPE_STRATEGY, 'auto'] as const),
  rules: z.object({
    titleSelector: z.string().nullable().optional(),
    priceSelector: z.string().nullable().optional(),
    oldPriceSelector: z.string().nullable().optional(),
    availabilitySelector: z.string().nullable().optional(),
    imageSelector: z.string().nullable().optional(),
    shippingSelector: z.string().nullable().optional(),
    ratingSelector: z.string().nullable().optional(),
    priceRegex: z.string().nullable().optional(),
    useJsonLd: z.boolean().default(true),
    useOpenGraph: z.boolean().default(true),
  }),
  respectRobots: z.boolean().default(true),
  userAgent: z.string().min(5),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
});
export type ScrapeRequestPayload = z.infer<typeof scrapeRequestSchema>;

export const scrapeResponseOkSchema = z.object({
  ok: z.literal(true),
  data: extractedProductSchema,
  meta: z.object({
    strategy: z.enum(['cheerio', 'playwright']),
    httpStatus: z.number(),
    durationMs: z.number(),
    robotsAllowed: z.boolean(),
    sourcePath: z.enum(['json-ld', 'og', 'selector', 'mixed']),
    confidence: z.number().min(0).max(1),
  }),
  raw: z.object({ htmlSnippet: z.string().optional() }).optional(),
});

export const scrapeResponseErrSchema = z.object({
  ok: z.literal(false),
  errorCode: z.enum(SNAPSHOT_STATUS),
  message: z.string(),
  meta: z.object({
    strategy: z.enum(['cheerio', 'playwright']),
    httpStatus: z.number().optional(),
    durationMs: z.number(),
    robotsAllowed: z.boolean().optional(),
  }),
});

export const scrapeResponseSchema = z.discriminatedUnion('ok', [
  scrapeResponseOkSchema,
  scrapeResponseErrSchema,
]);
