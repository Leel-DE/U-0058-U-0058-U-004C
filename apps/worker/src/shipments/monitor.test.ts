import { describe, expect, it } from 'vitest';

import { shouldRunCanonicalShipmentMonitor } from './monitor.js';

const credentials = {
  TORQUECORE_SUPABASE_URL: 'https://example.supabase.co',
  TORQUECORE_SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

describe('shouldRunCanonicalShipmentMonitor', () => {
  it('stays off without TorqueCore credentials', () => {
    expect(shouldRunCanonicalShipmentMonitor({})).toBe(false);
    expect(
      shouldRunCanonicalShipmentMonitor({ TORQUECORE_SUPABASE_URL: credentials.TORQUECORE_SUPABASE_URL }),
    ).toBe(false);
  });

  it('runs when credentials exist and the bridge is not configured', () => {
    expect(shouldRunCanonicalShipmentMonitor({ ...credentials })).toBe(true);
  });

  it('yields to the bridge when TORQUECORE_AUTOMATION_ORG_ID is set', () => {
    // Regression guard for the duplicate-jobs incident: two consumers on the
    // same run queue doubled every shipment check.
    expect(
      shouldRunCanonicalShipmentMonitor({
        ...credentials,
        TORQUECORE_AUTOMATION_ORG_ID: '6b896c6a-c7f1-4dea-8f43-04a678eb0868',
      }),
    ).toBe(false);
  });

  it('can be forced on alongside the bridge via TORQUECORE_CANONICAL_MONITOR', () => {
    expect(
      shouldRunCanonicalShipmentMonitor({
        ...credentials,
        TORQUECORE_AUTOMATION_ORG_ID: '6b896c6a-c7f1-4dea-8f43-04a678eb0868',
        TORQUECORE_CANONICAL_MONITOR: 'true',
      }),
    ).toBe(true);
  });
});
