import type { ErrorCode } from '../types.js';

const CAPTCHA_HINTS = [
  /recaptcha/i,
  /captcha/i,
  /cf-challenge/i,
  /are you (a )?human/i,
  /cloudflare ray id/i,
  /verifying you are human/i,
  /attention required/i,
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
  if (CAPTCHA_HINTS.some((re) => re.test(html.slice(0, 8_000)))) {
    return { ok: false, code: 'captcha' };
  }
  if (status === 200 && html.length < SUSPICIOUS_SIZE) {
    return { ok: false, code: 'suspicious' };
  }
  return { ok: true };
}
