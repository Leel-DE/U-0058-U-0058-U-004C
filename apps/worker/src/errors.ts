export class SelectorError extends Error {
  override name = 'SelectorError';
}

export class CaptchaError extends Error {
  override name = 'CaptchaError';
}

export class BlockedError extends Error {
  override name = 'BlockedError';
}

export class BrowserLaunchError extends Error {
  override name = 'BrowserLaunchError';
}

export class ExtractionError extends Error {
  override name = 'ExtractionError';
}

export class NavigationError extends Error {
  override name = 'NavigationError';
}

export class RetryableError extends Error {
  override name = 'RetryableError';
}

export class FatalScrapeError extends Error {
  override name = 'FatalScrapeError';
}

export function classifyWorkerError(error: unknown) {
  if (error instanceof CaptchaError) return 'captcha';
  if (error instanceof BlockedError) return 'blocked';
  if (error instanceof SelectorError || error instanceof ExtractionError) return 'parse_failed';
  if (error instanceof BrowserLaunchError || error instanceof NavigationError) return 'http_error';
  return 'http_error';
}
