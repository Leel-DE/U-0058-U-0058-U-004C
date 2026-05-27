import { z } from 'zod';

export const PRODUCT_REPAIR_SELECTOR_FIELDS = [
  'titleSelector',
  'priceSelector',
  'oldPriceSelector',
  'availabilitySelector',
  'imageSelector',
  'brandSelector',
  'skuSelector',
  'breadcrumbsSelector',
] as const;

export const REQUIRED_PRODUCT_REPAIR_FIELDS = ['titleSelector', 'priceSelector'] as const;

export type ProductRepairSelectorField = (typeof PRODUCT_REPAIR_SELECTOR_FIELDS)[number];

const selector = z.string().trim().min(1).max(500).nullable().optional();

export const productRepairSelectorsSchema = z.object({
  titleSelector: selector,
  priceSelector: selector,
  oldPriceSelector: selector,
  availabilitySelector: selector,
  imageSelector: selector,
  brandSelector: selector,
  skuSelector: selector,
  breadcrumbsSelector: selector,
});

export const productRepairRulesSchema = productRepairSelectorsSchema.extend({
  priceRegex: z.string().trim().min(1).max(200).nullable().optional(),
  useJsonLd: z.boolean().optional(),
  useOpenGraph: z.boolean().optional(),
});

export const selectorRepairSuggestionSchema = z.object({
  selectors: productRepairSelectorsSchema.default({}),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(1000).default(''),
  warnings: z.array(z.string().max(300)).default([]),
});

export const selectorRepairRequestSchema = z.object({
  html: z.string().min(1),
  url: z.string().url(),
  oldSelectors: productRepairRulesSchema.default({}),
  failedFields: z.array(z.enum(PRODUCT_REPAIR_SELECTOR_FIELDS)).default([]),
  previousValues: z
    .object({
      title: z.string().max(1000).nullable().optional(),
      price: z.number().nullable().optional(),
      currency: z.string().max(10).nullable().optional(),
      availability: z.string().max(100).nullable().optional(),
      image: z.string().max(2000).nullable().optional(),
      sku: z.string().max(500).nullable().optional(),
    })
    .default({}),
  store: z
    .object({
      name: z.string().max(200).nullable().optional(),
      domain: z.string().max(255).nullable().optional(),
      framework: z.string().max(80).nullable().optional(),
    })
    .default({}),
});

export type ProductRepairSelectors = z.infer<typeof productRepairSelectorsSchema>;
export type ProductRepairRules = z.infer<typeof productRepairRulesSchema>;
export type SelectorRepairSuggestion = z.infer<typeof selectorRepairSuggestionSchema>;
export type SelectorRepairRequest = z.infer<typeof selectorRepairRequestSchema>;

export interface SelectorRepairFieldResult {
  valid: boolean;
  selector?: string;
  value?: string;
  count?: number;
  confidence: number;
  error?: string;
  warnings?: string[];
}

export interface SelectorRepairValidationResult {
  valid: boolean;
  fieldResults: Partial<Record<ProductRepairSelectorField, SelectorRepairFieldResult>>;
  overallConfidence: number;
  errors: string[];
  warnings: string[];
}

export interface SelectorRepairRunnerResult {
  ok: boolean;
  status: 'skipped' | 'suggested' | 'validated' | 'failed';
  suggestedSelectors?: ProductRepairSelectors;
  appliedSelectors?: ProductRepairSelectors;
  validation?: SelectorRepairValidationResult;
  confidence: number;
  reason?: string;
  warnings: string[];
  error?: string;
  cleanedDomHash?: string;
  tokenEstimate?: number;
  aiProvider?: string;
  aiModel?: string;
  autoApplyRecommended: boolean;
}
