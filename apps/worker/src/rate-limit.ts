/** Per-domain delay enforcer. In-memory only; restart clears state. */
const lastFetch = new Map<string, number>();

export async function throttleByDomain(host: string, minDelayMs: number): Promise<void> {
  const now = Date.now();
  const prev = lastFetch.get(host) ?? 0;
  const wait = Math.max(0, prev + minDelayMs - now);
  lastFetch.set(host, now + wait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
