export type RetryReason =
  | 'timeout'
  | 'captcha'
  | 'blocked'
  | 'selector_failed'
  | 'browser_crash'
  | 'navigation_failed'
  | 'extraction_empty'
  | 'http_error'
  | 'unknown';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableReasons: RetryReason[];
}

export interface RetryAttempt {
  attempt: number;
  maxAttempts: number;
  reason: RetryReason;
  delayMs: number;
}

export const DEFAULT_SCRAPE_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  retryableReasons: ['timeout', 'http_error', 'browser_crash', 'navigation_failed'],
};

export function classifyRetryReason(error: unknown): RetryReason {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('timeout') || message.includes('aborted')) return 'timeout';
    if (message.includes('captcha')) return 'captcha';
    if (message.includes('blocked') || message.includes('403')) return 'blocked';
    if (message.includes('selector') || message.includes('parse_failed')) return 'selector_failed';
    if (message.includes('browser') || message.includes('target closed')) return 'browser_crash';
    if (message.includes('navigation') || message.includes('net::')) return 'navigation_failed';
    if (message.includes('empty') || message.includes('no extraction')) return 'extraction_empty';
    return 'http_error';
  }
  return 'unknown';
}

export function retryDelayMs(attempt: number, policy: RetryPolicy = DEFAULT_SCRAPE_RETRY_POLICY) {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * policy.baseDelayMs);
  return Math.min(policy.maxDelayMs, exponential + jitter);
}

export async function withRetryBudget<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_SCRAPE_RETRY_POLICY,
  onRetry?: (attempt: RetryAttempt) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const reason = classifyRetryReason(error);
      const retryable = policy.retryableReasons.includes(reason);
      if (!retryable || attempt >= policy.maxAttempts) break;
      const delayMs = retryDelayMs(attempt, policy);
      onRetry?.({ attempt, maxAttempts: policy.maxAttempts, reason, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
