export function selectorValidationPrompt(dom: string, selectorsJson: string): string {
  return `Validate these ecommerce CSS selectors against the cleaned DOM.
Return ONLY JSON: {"valid":true,"confidence":0.0,"problems":[]}

Selectors:
${selectorsJson}

Cleaned DOM:
${dom}`;
}

