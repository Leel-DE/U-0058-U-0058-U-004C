import { describe, expect, it } from 'vitest';
import { classifyResponse, classifyResponseStrict } from './block.js';

const realProductPageWithGdprFooter = `
<!doctype html>
<html><head><title>E-Bike Stadt Auto | Fahrrad XXL</title></head>
<body>
  <h1>E-Bike Trekking</h1>
  <div class="products">…</div>
  <footer>
    <p>Diese Seite ist durch reCAPTCHA und die Google
       <a href="/datenschutz">Datenschutzerklärung</a> geschützt.</p>
    <p>Hinweise zu Captcha-Problemen finden Sie in unserem FAQ.</p>
  </footer>
</body></html>
${'<div>padding</div>'.repeat(200)}
`;

const realCaptchaChallenge = `
<!doctype html>
<html><head><title>Just a moment...</title></head>
<body>
  <div id="cf-wrapper">
    <h1>Checking your browser before accessing…</h1>
    <iframe src="https://challenges.cloudflare.com/turnstile" />
    <script>window._cf_chl_opt = {};</script>
  </div>
</body></html>`;

const recaptchaForm = `
<!doctype html>
<html><body>
  <form action="/login">
    <div class="g-recaptcha" data-sitekey="6Lc..."></div>
    <button>Submit</button>
  </form>
</body></html>
${'<p>filler</p>'.repeat(200)}
`;

describe('classifyResponse (loose)', () => {
  it('flags Cloudflare challenge page', () => {
    expect(classifyResponse(200, realCaptchaChallenge)).toEqual({ ok: false, code: 'captcha' });
  });
  it('flags HTTP 429 immediately', () => {
    expect(classifyResponse(429, 'whatever')).toEqual({ ok: false, code: 'blocked' });
  });
  it('does NOT flag a real product page whose footer mentions Captcha/reCAPTCHA', () => {
    expect(classifyResponse(200, realProductPageWithGdprFooter)).toEqual({ ok: true });
  });
  it('flags g-recaptcha widget on the page', () => {
    expect(classifyResponse(200, recaptchaForm)).toEqual({ ok: false, code: 'captcha' });
  });
});

describe('classifyResponseStrict (post-captcha)', () => {
  it('returns ok for a normal page that mentions Captcha in footer', () => {
    expect(classifyResponseStrict(200, realProductPageWithGdprFooter)).toEqual({ ok: true });
  });
  it('still flags an actual Cloudflare challenge', () => {
    expect(classifyResponseStrict(200, realCaptchaChallenge)).toEqual({ ok: false, code: 'captcha' });
  });
  it('still flags a hard HTTP block', () => {
    expect(classifyResponseStrict(403, 'forbidden')).toEqual({ ok: false, code: 'blocked' });
    expect(classifyResponseStrict(429, 'rate limited')).toEqual({ ok: false, code: 'blocked' });
  });
  it('does NOT flag short pages as suspicious (a thank-you page is fine)', () => {
    expect(classifyResponseStrict(200, '<html><body>Thank you!</body></html>')).toEqual({ ok: true });
  });
  it('still flags a recaptcha widget', () => {
    expect(classifyResponseStrict(200, recaptchaForm)).toEqual({ ok: false, code: 'captcha' });
  });
});
