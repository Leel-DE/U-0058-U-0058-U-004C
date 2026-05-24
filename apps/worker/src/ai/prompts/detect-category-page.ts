export function categorySelectorPrompt(dom: string): string {
  return `You are detecting stable CSS selectors for an ecommerce category/listing page.
Return ONLY valid JSON with this exact shape:
{"productCardSelector":"","cardTitleSelector":"","cardPriceSelector":"","cardLinkSelector":"","cardImageSelector":"","confidence":0.0,"notes":[]}

Rules:
- productCardSelector must match repeated product cards.
- Card child selectors should work inside or across those cards.
- Prefer itemprop, data-testid, data-test, aria-label, semantic ids/classes.
- Avoid nth-child, generated hashes, and giant descendant chains.
- Prefer stable repeated product-card containers, not inner price/title nodes.
- Notes must be short strings about uncertain selectors or missing fields.
- Do not include markdown or explanations.

Cleaned DOM:
${dom}`;
}
