import { describe, expect, it } from 'vitest';

import { nextShipmentCheck, selectPrunableJobIds } from './adaptive-scheduler.js';

describe('nextShipmentCheck with operator override', () => {
  it('uses the pinned interval instead of the adaptive one', () => {
    expect(nextShipmentCheck('customs', 720).minutes).toBe(720);
    expect(nextShipmentCheck('out_for_delivery', 1440).minutes).toBe(1440);
  });

  it('falls back to the adaptive schedule when the override is empty or invalid', () => {
    expect(nextShipmentCheck('customs', null).minutes).toBe(60);
    expect(nextShipmentCheck('in_transit', undefined).minutes).toBe(180);
    expect(nextShipmentCheck('in_transit', 0).minutes).toBe(180);
    expect(nextShipmentCheck('in_transit', 5).minutes).toBe(180); // below the 15-minute floor
  });

  it('clamps absurdly large overrides to one week', () => {
    expect(nextShipmentCheck('in_transit', 1_000_000).minutes).toBe(10_080);
  });
});

describe('selectPrunableJobIds', () => {
  const row = (id: string, key: string | null, at: string) => ({
    id,
    dedupe_key: key,
    created_at: at,
  });

  it('keeps the newest N jobs per shipment and prunes the rest', () => {
    const rows = [
      row('a1', 'shipment:A', '2026-07-19T04:00:00Z'),
      row('a2', 'shipment:A', '2026-07-19T03:00:00Z'),
      row('a3', 'shipment:A', '2026-07-19T02:00:00Z'),
      row('a4', 'shipment:A', '2026-07-19T01:00:00Z'),
      row('b1', 'shipment:B', '2026-07-19T04:00:00Z'),
    ];
    const pruned = selectPrunableJobIds(rows, 3);
    expect(pruned.sort()).toEqual(['a4']);
  });

  it('prunes nothing while each shipment is within its history budget', () => {
    const rows = [
      row('a1', 'shipment:A', '2026-07-19T04:00:00Z'),
      row('b1', 'shipment:B', '2026-07-19T04:00:00Z'),
    ];
    expect(selectPrunableJobIds(rows, 3)).toEqual([]);
  });

  it('treats jobs without a dedupe key as independent entries', () => {
    const rows = [
      row('x1', null, '2026-07-19T04:00:00Z'),
      row('x2', null, '2026-07-19T03:00:00Z'),
    ];
    expect(selectPrunableJobIds(rows, 1)).toEqual([]);
  });

  it('prunes bridge-mirrored runs once they are regrouped by shipment', () => {
    // pruneFinishedShipmentJobs rewrites torquecore-run:<id> keys to
    // shipment:<id> before calling this — same-shipment runs then share one
    // history budget instead of each being its own exempt group.
    const rows = [
      row('r1', 'shipment:A', '2026-07-19T04:00:00Z'),
      row('r2', 'shipment:A', '2026-07-19T03:00:00Z'),
      row('r3', 'shipment:A', '2026-07-19T02:00:00Z'),
      row('r4', 'shipment:A', '2026-07-19T01:00:00Z'),
    ];
    expect(selectPrunableJobIds(rows, 3).sort()).toEqual(['r4']);
  });
});
