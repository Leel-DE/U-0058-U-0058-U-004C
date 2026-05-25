export function productSelectorPrompt(dom: string): string {
  return `You are detecting stable CSS selectors for one ecommerce product page.
Return ONLY valid JSON with this exact shape:
{"titleSelector":"","priceSelector":"","oldPriceSelector":"","availabilitySelector":"","imageSelector":"","brandSelector":"","skuSelector":"","breadcrumbsSelector":"","shippingSelector":"","ratingSelector":"","currency":"EUR","confidence":0.0,"notes":[]}

Rules:
- Prefer stable semantic selectors: itemprop, data-testid, data-test, aria-label, schema.org attributes, meaningful ids/classes.
- Avoid nth-child, long descendant chains, generated hashes, layout wrappers, and selectors that match many unrelated nodes.
- Use null for unknown optional selectors.
- Do not include markdown or explanations.

Cleaned DOM:
${dom}`;
}
