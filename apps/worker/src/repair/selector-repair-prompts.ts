import type { SelectorRepairRequest } from './selector-repair-types.js';

export function productSelectorRepairPrompt(input: SelectorRepairRequest & { cleanedDom: string }): string {
  return `You repair CSS selectors for one ecommerce product page.

Return JSON only. Do not use markdown. Do not wrap the JSON in code fences.

Goal:
- Suggest stable replacement selectors for failed or brittle product fields.
- Prefer semantic selectors: itemprop, data-testid, data-test, aria-label, schema.org attributes, meaningful ids/classes.
- Avoid header, footer, navigation, account, mini-cart, recommendation widgets, nth-child chains, generated hashes, and long layout-wrapper paths.
- Use null for fields you cannot repair confidently.
- Keep selectors short and specific enough to extract from the product detail area.

Required JSON shape:
{
  "selectors": {
    "titleSelector": "...",
    "priceSelector": "...",
    "oldPriceSelector": "...",
    "availabilitySelector": "...",
    "imageSelector": "...",
    "brandSelector": "...",
    "skuSelector": "...",
    "breadcrumbsSelector": "..."
  },
  "confidence": 0.0,
  "reason": "...",
  "warnings": []
}

Context:
URL: ${input.url}
Store: ${JSON.stringify(input.store)}
Failed fields: ${JSON.stringify(input.failedFields)}
Old selectors: ${JSON.stringify(input.oldSelectors)}
Previous successful values: ${JSON.stringify(input.previousValues)}

Expected field types:
- titleSelector: non-empty product title text.
- priceSelector: current product price text containing a parseable number.
- oldPriceSelector: optional crossed-out/list price.
- availabilitySelector: stock/availability text.
- imageSelector: product image element or metadata with src/content URL.
- brandSelector: product brand text.
- skuSelector: SKU, item number, or product code text.
- breadcrumbsSelector: category breadcrumb text/list.

Cleaned DOM:
${input.cleanedDom}`;
}
