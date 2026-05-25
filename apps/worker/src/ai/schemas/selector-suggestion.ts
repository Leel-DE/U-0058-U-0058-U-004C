import { z } from 'zod';

const selector = z.string().trim().min(1).max(500).nullable().optional();

export const selectorSuggestionSchema = z.object({
  titleSelector: selector,
  priceSelector: selector,
  oldPriceSelector: selector,
  availabilitySelector: selector,
  imageSelector: selector,
  brandSelector: selector,
  skuSelector: selector,
  breadcrumbsSelector: selector,
  shippingSelector: selector,
  ratingSelector: selector,
  currency: z.string().trim().length(3).optional(),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string().max(300)).default([]),
});

export type SelectorSuggestion = z.infer<typeof selectorSuggestionSchema>;
