import type { Extracted } from '../../types.js';

export function isUsableExtraction(data: Extracted | null | undefined): data is Extracted {
  return Boolean(data?.title && data.price != null && data.price > 0);
}

