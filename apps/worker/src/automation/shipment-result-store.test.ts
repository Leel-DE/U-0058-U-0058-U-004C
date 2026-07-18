import { describe, expect, it } from 'vitest';

import {
  computeProviderHealth,
  PROVIDER_AUTO_DISABLE_THRESHOLD,
} from './shipment-result-store.js';

describe('computeProviderHealth', () => {
  it('does not auto-disable on repeated CAPTCHAs', () => {
    // A provider sitting just below the threshold that keeps returning CAPTCHA
    // must NOT tip over into a disable — CAPTCHA is "needs help", not an outage.
    let current = {
      success_rate: 0,
      captcha_rate: 1,
      avg_duration_ms: 1000,
      consecutive_failures: PROVIDER_AUTO_DISABLE_THRESHOLD - 1,
    };
    for (let i = 0; i < 10; i += 1) {
      const health = computeProviderHealth({ current, state: 'captcha', durationMs: 1000 });
      expect(health.consecutiveFailures).toBe(PROVIDER_AUTO_DISABLE_THRESHOLD - 1);
      expect(health.disabledForMs).toBeNull();
      current = {
        success_rate: health.successRate,
        captcha_rate: health.captchaRate,
        avg_duration_ms: health.avgDurationMs ?? 0,
        consecutive_failures: health.consecutiveFailures,
      };
    }
  });

  it('auto-disables after enough consecutive HARD failures', () => {
    let current: Parameters<typeof computeProviderHealth>[0]['current'] = null;
    let last = computeProviderHealth({ current, state: 'failed', durationMs: 0 });
    for (let i = 1; i < PROVIDER_AUTO_DISABLE_THRESHOLD; i += 1) {
      current = {
        success_rate: last.successRate,
        captcha_rate: last.captchaRate,
        avg_duration_ms: last.avgDurationMs ?? 0,
        consecutive_failures: last.consecutiveFailures,
      };
      expect(last.disabledForMs).toBeNull();
      last = computeProviderHealth({ current, state: 'timeout', durationMs: 0 });
    }
    expect(last.consecutiveFailures).toBe(PROVIDER_AUTO_DISABLE_THRESHOLD);
    expect(last.disabledForMs).toBe(30 * 60_000);
  });

  it('a single CAPTCHA does not push a nearly-failed provider over the edge', () => {
    const current = {
      success_rate: 0,
      captcha_rate: 0,
      avg_duration_ms: 500,
      consecutive_failures: PROVIDER_AUTO_DISABLE_THRESHOLD - 1,
    };
    const health = computeProviderHealth({ current, state: 'captcha', durationMs: 500 });
    expect(health.consecutiveFailures).toBe(PROVIDER_AUTO_DISABLE_THRESHOLD - 1);
    expect(health.disabledForMs).toBeNull();
  });

  it('success clears the failure streak and keeps the provider enabled', () => {
    const current = {
      success_rate: 0,
      captcha_rate: 0,
      avg_duration_ms: 800,
      consecutive_failures: 4,
    };
    const health = computeProviderHealth({ current, state: 'success', durationMs: 800 });
    expect(health.consecutiveFailures).toBe(0);
    expect(health.disabledForMs).toBeNull();
    expect(health.successRate).toBeGreaterThan(0);
  });
});
