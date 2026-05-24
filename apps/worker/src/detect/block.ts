import type { ErrorCode } from '../types.js';

/**
 * Loose hints — match the WORD "captcha" or generic anti-bot phrasing.
 * Used only when we have no other signal (the very first cheerio fetch on a
 * domain). Aggressive on purpose: better to bounce into a manual takeover
 * once than to keep ramming a blocked endpoint.
 */
const LOOSE_CAPTCHA_HINTS: RegExp[] = [
  /g-recaptcha/i,
  /h-captcha/i,
  /cf-challenge/i,
  /cf-error-code/i,
  /_cf_chl_opt/i,
  /just a moment\.\.\./i,
  /are you (a )?human/i,
  /cloudflare ray id/i,
  /verifying you are human/i,
  /attention required/i,
];

/**
 * Strict hints — only match ACTUAL captcha challenge markup, never the bare
 * word "captcha". Used after the user has already solved a challenge in the
 * headed browser; we must not false-positive on GDPR/footer text that
 * happens to mention "captcha" or "reCAPTCHA".
 */
const STRICT_CHALLENGE_PATTERNS: RegExp[] = [
  /<div[^>]+class=["'][^"']*g-recaptcha/i,
  /<iframe[^>]+src=["'][^"']*google\.com\/recaptcha/i,
  /<iframe[^>]+src=["'][^"']*recaptcha\.net\/recaptcha/i,
  /<iframe[^>]+src=["'][^"']*hcaptcha\.com/i,
  /<div[^>]+class=["'][^"']*h-captcha/i,
  /<div[^>]+id=["']cf-(challenge|error-details|wrapper)/i,
  /<form[^>]+action=["'][^"']*\/cdn-cgi\/challenge/i,
  /window\._cf_chl_opt\s*=/i,
  /<title>just a moment\.\.\.<\/title>/i,
  /<title>attention required![^<]*<\/title>/i,
  /<title>access denied[^<]*<\/title>/i,
];

const BLOCK_STATUS = new Set([401, 403, 429, 503, 451]);
const SUSPICIOUS_SIZE = 1024; // bytes

export function classifyResponse(
  status: number,
  html: string,
): { ok: true } | { ok: false; code: ErrorCode } {
  if (BLOCK_STATUS.has(status)) return { ok: false, code: 'blocked' };
  if (status === 0 || status >= 500) return { ok: false, code: 'http_error' };
  if (status === 404) return { ok: false, code: 'http_error' };
  if (LOOSE_CAPTCHA_HINTS.some((re) => re.test(html.slice(0, 8_000)))) {
    return { ok: false, code: 'captcha' };
  }
  if (status === 200 && html.length < SUSPICIOUS_SIZE) {
    return { ok: false, code: 'suspicious' };
  }
  return { ok: true };
}

/**
 * Stricter variant for pages that already came through a cookie-warmed
 * headed browser (post-manual-challenge). Only flags real challenge UI,
 * never the bare word "captcha". HTTP status checks still apply because
 * a hard 403/429 is unambiguous.
 */
export function classifyResponseStrict(
  status: number,
  html: string,
): { ok: true } | { ok: false; code: ErrorCode } {
  if (BLOCK_STATUS.has(status)) return { ok: false, code: 'blocked' };
  if (status === 0 || status >= 500) return { ok: false, code: 'http_error' };
  if (status === 404) return { ok: false, code: 'http_error' };
  if (STRICT_CHALLENGE_PATTERNS.some((re) => re.test(html.slice(0, 16_000)))) {
    return { ok: false, code: 'captcha' };
  }
  // Don't flag "suspicious" on small bodies — the visible browser may have
  // navigated to a legitimately short page (thank-you page, redirect target).
  return { ok: true };
}
