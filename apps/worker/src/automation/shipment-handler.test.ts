import { describe, expect, it } from 'vitest';

import { selectShipmentAdapters } from './shipment-handler.js';
import { shipmentAdapters } from './shipment-adapters.js';

const allIds = new Set(shipmentAdapters.map((adapter) => adapter.id));

describe('selectShipmentAdapters', () => {
  it('checks every configured aggregator when none are disabled', () => {
    const selected = selectShipmentAdapters(shipmentAdapters, allIds, new Set());
    expect(selected.map((adapter) => adapter.id)).toEqual(
      shipmentAdapters.map((adapter) => adapter.id),
    );
    // Regression guard: the automation must never collapse to a single source.
    expect(selected.length).toBeGreaterThan(1);
  });

  it('excludes providers disabled by the circuit breaker but keeps the healthy rest', () => {
    // Reproduces the incident: ups/17track/postal_ninja/yanwen tripped the
    // provider-health breaker, which previously left only two sources.
    const disabled = new Set(['ups', '17track', 'postal_ninja', 'yanwen']);
    const selected = selectShipmentAdapters(shipmentAdapters, allIds, disabled);
    expect(selected.map((adapter) => adapter.id).sort()).toEqual(['parcelsapp', 'ship24']);
  });

  it('still checks multiple providers when only one is disabled', () => {
    const selected = selectShipmentAdapters(shipmentAdapters, allIds, new Set(['ups']));
    expect(selected.some((adapter) => adapter.id === 'ups')).toBe(false);
    expect(selected.length).toBe(shipmentAdapters.length - 1);
    expect(selected.length).toBeGreaterThan(1);
  });

  it('honours an explicit provider allowlist', () => {
    const configured = new Set(['ship24', 'parcelsapp']);
    const selected = selectShipmentAdapters(shipmentAdapters, configured, new Set());
    expect(selected.map((adapter) => adapter.id).sort()).toEqual(['parcelsapp', 'ship24']);
  });

  it('returns nothing when every provider is disabled (no false single-source)', () => {
    const selected = selectShipmentAdapters(shipmentAdapters, allIds, allIds);
    expect(selected).toEqual([]);
  });
});
