export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function reduceDomForPrompt(html: string, maxChars: number): string {
  if (html.length <= maxChars) return html;
  const head = html.slice(0, Math.floor(maxChars * 0.7));
  const tail = html.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n<!-- DOM_TRUNCATED_MIDDLE -->\n${tail}`;
}

