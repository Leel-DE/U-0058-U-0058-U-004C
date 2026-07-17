import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildTrackingExcerpt,
  classifyTrackingPage,
  deriveShipmentCloudRunStatus,
  isUpsTrackingNumber,
  type ShipmentTrackingSourceResult,
} from './tracking-core.js';

const trackingNumber = 'AB123456789CD';

test('classifies CAPTCHA and paywall pages as skipped', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: 'Verify that you are human before continuing',
      trackingNumber,
    }),
    { state: 'captcha', statusHint: null },
  );
  assert.deepEqual(
    classifyTrackingPage({
      text: 'Upgrade your plan to continue tracking this parcel',
      trackingNumber,
    }),
    { state: 'paywall', statusHint: null },
  );
});

test('recognizes anti-bot and CDN block pages', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: 'РўСЂРёРІР°С” РїРµСЂРµРІС–СЂРєР° Р±РµР·РїРµРєРё. РўСЂРѕС…Рё Р·Р°С‡РµРєР°Р№С‚Рµ.',
      trackingNumber,
    }),
    { state: 'captcha', statusHint: null },
  );
  assert.deepEqual(
    classifyTrackingPage({
      text: '403 ERROR. The request could not be satisfied. Request blocked.',
      trackingNumber,
    }),
    { state: 'blocked', statusHint: null },
  );
});

test('validates UPS tracking numbers without carrier metadata', () => {
  assert.equal(isUpsTrackingNumber('1Z0R6D896828244757'), true);
  assert.equal(isUpsTrackingNumber('1Z0R6D896828244758'), false);
  assert.equal(isUpsTrackingNumber('YWAA001029439'), false);
});

test('recognizes common label-created wording', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: `${trackingNumber}\nInfo Received\nShipper created a label`,
      trackingNumber,
    }),
    { state: 'success', statusHint: 'registered' },
  );
});

test('rejects unrelated demo data even when it looks like tracking history', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: 'Demo parcel CN000000000CN is in transit and arrived at hub',
      trackingNumber,
    }),
    { state: 'irrelevant', statusHint: null },
  );
});

test('accepts a relevant rendered result and derives a conservative hint', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: `${trackingNumber}\nShipment information received\nGermany`,
      trackingNumber,
    }),
    { state: 'success', statusHint: 'registered' },
  );
});

test('uses only the scoped result text for status classification', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: 'Shipment information received',
      trackingContext: `Search input: ${trackingNumber}`,
      trackingNumber,
    }),
    { state: 'success', statusHint: 'registered' },
  );
});

test('explicit no-information result wins over delivered SEO copy', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: [
        'No information about your package.',
        'Other shipments can be delivered by courier companies.',
      ].join('\n'),
      trackingContext: trackingNumber,
      trackingNumber,
    }),
    { state: 'not_found', statusHint: null },
  );
});

test('reload placeholder is not accepted as tracking evidence', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: [
        'Add package title',
        '16 Jul 2026',
        'Please reload the page, to be able to track your package',
      ].join('\n'),
      trackingContext: trackingNumber,
      trackingNumber,
    }),
    { state: 'irrelevant', statusHint: null },
  );
});

test('carrier refusal to complete the tracking request is a block, not a miss', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: [
        'Tracking Error',
        'We are unable to complete your tracking request at this time. Please try again later.',
      ].join('\n'),
      trackingContext: trackingNumber,
      trackingNumber,
    }),
    { state: 'blocked', statusHint: null },
  );
});

test('long generic copy without a tracking event is rejected', () => {
  assert.deepEqual(
    classifyTrackingPage({
      text: 'Track parcels from many carriers and receive delivery updates. '.repeat(4),
      trackingContext: trackingNumber,
      trackingNumber,
    }),
    { state: 'irrelevant', statusHint: null },
  );
});

test('stored excerpts are bounded, deduplicated and mask the tracking number', () => {
  const excerpt = buildTrackingExcerpt(
    `${trackingNumber}\nIn transit\nIn transit\nBerlin`,
    trackingNumber,
    80,
  );

  assert.equal(excerpt, '[TRACKING_NUMBER]\nIn transit\nBerlin');
  assert.equal(excerpt.includes(trackingNumber), false);
});

test('tracking number masking is case-insensitive', () => {
  const excerpt = buildTrackingExcerpt(
    `${trackingNumber.toLowerCase()}\nDelivered`,
    trackingNumber,
  );

  assert.equal(excerpt, '[TRACKING_NUMBER]\nDelivered');
});

function sourceResult(
  source: ShipmentTrackingSourceResult['source'],
  state: ShipmentTrackingSourceResult['state'],
): ShipmentTrackingSourceResult {
  return {
    source,
    label: source,
    state,
    checkedAt: '2026-07-16T20:00:00.000Z',
    httpStatus: 200,
    statusHint: state === 'success' ? 'in_transit' : null,
    excerpt: state === 'success' ? 'In transit' : null,
    error: null,
  };
}

test('cloud run is partial when one source has data and others are rejected', () => {
  assert.equal(
    deriveShipmentCloudRunStatus({
      results: [sourceResult('parcelsapp', 'success'), sourceResult('ship24', 'irrelevant')],
      hasPresentation: true,
    }),
    'partial',
  );
});

test('explicit no-information response is a completed partial check', () => {
  assert.equal(
    deriveShipmentCloudRunStatus({
      results: [sourceResult('parcelsapp', 'not_found'), sourceResult('ship24', 'irrelevant')],
      hasPresentation: false,
    }),
    'partial',
  );
});

test('cloud run fails when every source is blocked or unrelated', () => {
  assert.equal(
    deriveShipmentCloudRunStatus({
      results: [sourceResult('postal_ninja', 'captcha'), sourceResult('ship24', 'irrelevant')],
      hasPresentation: false,
    }),
    'failed',
  );
});
