import { z } from 'zod';

const selector = z.string().trim().min(1).max(500).nullable().optional();

export const categorySuggestionSchema = z.object({
  productCardSelector: selector,
  cardTitleSelector: selector,
  cardPriceSelector: selector,
  cardOldPriceSelector: selector,
  cardLinkSelector: selector,
  cardImageSelector: selector,
  cardAvailabilitySelector: selector,
  paginationNextSelector: selector,
  loadMoreSelector: selector,
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string().trim().max(500)).max(20).optional(),
});

export type CategorySuggestion = z.infer<typeof categorySuggestionSchema>;
