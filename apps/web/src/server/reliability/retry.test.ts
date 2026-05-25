import { describe, expect, it, vi } from 'vitest';
import { classifyRetryReason, withRetryBudget } from './retry';

describe('retry stabilization', () => {
  it('classifies common scrape failure reasons', () => {
    expect(classifyRetryReason(new Error('TimeoutError: operation aborted'))).toBe('timeout');
    expect(classifyRetryReason(new Error('captcha page detected'))).toBe('captcha');
    expect(classifyRetryReason(new Error('browser target closed'))).toBe('browser_crash');
    expect(classifyRetryReason(new Error('parse_failed'))).toBe('selector_failed');
  });

  it('honors retry budgets', async () => {
    vi.spyOn(globalThis.Math, 'random').mockReturnValue(0);
    const retries: string[] = [];
    let attempts = 0;
    await expect(
      withRetryBudget(
        async () => {
          attempts += 1;
          if (attempts < 2) throw new Error('network http_error');
          return 'ok';
        },
        { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1, retryableReasons: ['http_error'] },
        (attempt) => retries.push(attempt.reason),
      ),
    ).resolves.toBe('ok');
    expect(retries).toEqual(['http_error']);
    expect(attempts).toBe(2);
    vi.restoreAllMocks();
  });
});
