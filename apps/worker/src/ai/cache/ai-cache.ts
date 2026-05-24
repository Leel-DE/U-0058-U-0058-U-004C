import { LRUCache } from 'lru-cache';

interface CacheEntry<T> {
  value: T;
  createdAt: number;
}

const cache = new LRUCache<string, CacheEntry<unknown>>({
  max: 250,
  ttl: 1000 * 60 * 60 * 24,
});

const pending = new Map<string, Promise<unknown>>();
const stats = { hits: 0, misses: 0 };

export function getCachedAi<T>(key: string): T | undefined {
  return cache.get(key)?.value as T | undefined;
}

export function setCachedAi<T>(key: string, value: T): void {
  cache.set(key, { value, createdAt: Date.now() });
}

export async function debounceAi<T>(key: string, fn: () => Promise<T>): Promise<{ value: T; cacheHit: boolean }> {
  const cached = getCachedAi<T>(key);
  if (cached) {
    stats.hits += 1;
    return { value: cached, cacheHit: true };
  }
  const existing = pending.get(key) as Promise<T> | undefined;
  if (existing) {
    stats.hits += 1;
    return { value: await existing, cacheHit: true };
  }
  stats.misses += 1;
  const promise = fn();
  pending.set(key, promise);
  try {
    const value = await promise;
    setCachedAi(key, value);
    return { value, cacheHit: false };
  } finally {
    pending.delete(key);
  }
}

export function aiCacheStats() {
  const total = stats.hits + stats.misses;
  return {
    hits: stats.hits,
    misses: stats.misses,
    hitRate: total ? stats.hits / total : 0,
    size: cache.size,
  };
}
