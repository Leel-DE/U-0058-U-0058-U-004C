import { z } from 'zod';

export const shipmentTrackingSourceIdSchema = z.enum([
  'ups',
  'postal_ninja',
  'parcelsapp',
  'ship24',
  '17track',
]);

export type ShipmentTrackingSourceId = z.infer<typeof shipmentTrackingSourceIdSchema>;

export const shipmentTrackingSourceStateSchema = z.enum([
  'success',
  'captcha',
  'blocked',
  'paywall',
  'not_found',
  'irrelevant',
  'not_configured',
  'timeout',
  'error',
]);

export type ShipmentTrackingSourceState = z.infer<typeof shipmentTrackingSourceStateSchema>;

export const shipmentTrackingStatusHintSchema = z.enum([
  'registered',
  'in_transit',
  'customs',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
  'unknown',
]);

export type ShipmentTrackingStatusHint = z.infer<typeof shipmentTrackingStatusHintSchema>;

export const shipmentTrackingSourceResultSchema = z.object({
  source: shipmentTrackingSourceIdSchema,
  label: z.string().trim().min(1).max(80),
  state: shipmentTrackingSourceStateSchema,
  checkedAt: z.string().datetime(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  statusHint: shipmentTrackingStatusHintSchema.nullable(),
  excerpt: z.string().max(4_000).nullable(),
  error: z.string().max(300).nullable(),
});

export type ShipmentTrackingSourceResult = z.infer<typeof shipmentTrackingSourceResultSchema>;

export const shipmentTrackingPresentationSchema = z.object({
  displayStatus: z.string().trim().min(1).max(120),
  headline: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(800),
  carrier: z.string().trim().min(1).max(160).nullable().default(null),
  origin: z.string().trim().min(1).max(160).nullable().default(null),
  destination: z.string().trim().min(1).max(160).nullable().default(null),
  latestLocation: z.string().trim().min(1).max(200).nullable().default(null),
  latestEvent: z.string().trim().min(1).max(300).nullable().default(null),
  latestEventAt: z.string().trim().min(1).max(120).nullable().default(null),
  nextStep: z.string().trim().min(1).max(300).nullable(),
  needsAttention: z.boolean(),
  confidence: z.number().min(0).max(1),
  factsUsed: z.array(z.string().trim().min(1).max(240)).max(12),
  language: z.enum(['de', 'en', 'uk', 'ru']),
});

export type ShipmentTrackingPresentation = z.infer<typeof shipmentTrackingPresentationSchema>;

const CAPTCHA_PATTERNS = [
  /captcha/i,
  /verify (?:that )?you are human/i,
  /human verification/i,
  /checking your browser/i,
  /security verification/i,
  /just a moment/i,
  /триває перевірка безпеки/i,
  /РўСЂРёРІР°С”/i,
  /С‚СЂРёРІР°С” РїРµСЂРµРІС–СЂРєР° Р±РµР·РїРµРєРё/i,
  /С‚СЂРѕС…Рё Р·Р°С‡РµРєР°Р№С‚Рµ/i,
  /cf-chl-/i,
];

const BLOCKED_PATTERNS = [
  /403 error/i,
  /request blocked/i,
  /the request could not be satisfied/i,
  /access denied/i,
  /unable to complete your tracking request/i,
];

const PAYWALL_PATTERNS = [
  /payment required/i,
  /upgrade (?:your|the) plan/i,
  /buy (?:more )?credits/i,
  /subscribe to continue/i,
  /pricing plan required/i,
  /paid plan required/i,
];

const NOT_FOUND_PATTERNS = [
  /tracking (?:number|information) (?:was )?not found/i,
  /no tracking information/i,
  /no information (?:was )?found/i,
  /no information about (?:your|this|the) (?:package|parcel|shipment)/i,
  /no information (?:is )?available for (?:this|the) (?:package|parcel|shipment)/i,
  /could(?: not|n't) find (?:the )?(?:parcel|shipment|tracking)/i,
  /unknown tracking number/i,
  /shipment not found/i,
];

const STATUS_PATTERNS: Array<[ShipmentTrackingStatusHint, readonly RegExp[]]> = [
  ['delivered', [/\bdelivered\b/i, /successfully delivered/i]],
  ['returned', [/return(?:ed|ing) to sender/i, /shipment returned/i]],
  ['out_for_delivery', [/out for delivery/i, /with delivery courier/i, /courier is delivering/i]],
  ['customs', [/customs clearance/i, /held (?:at|by) customs/i]],
  ['exception', [/delivery exception/i, /delivery failed/i, /delivery attempt/i]],
  [
    'in_transit',
    [/\bin transit\b/i, /departed (?:from )?(?:facility|hub)/i, /arrived at (?:facility|hub)/i],
  ],
  [
    'registered',
    [
      /label created/i,
      /created a label/i,
      /(?:shipment )?(?:information|info) received/i,
      /pre-advice/i,
    ],
  ],
];

export function isUpsTrackingNumber(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  if (!/^1Z[0-9A-Z]{16}$/.test(normalized)) return false;

  const body = normalized.slice(2, -1);
  const valueOf = (character: string) =>
    /^\d$/.test(character) ? Number(character) : (character.charCodeAt(0) - 65 + 2) % 10;
  const sum = [...body].reduce(
    (total, character, index) => total + valueOf(character) * (index % 2 === 0 ? 1 : 2),
    0,
  );
  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return expectedCheckDigit === Number(normalized.at(-1));
}

export function classifyTrackingPage(input: {
  text: string;
  trackingNumber: string;
  trackingContext?: string;
}): {
  state: ShipmentTrackingSourceState;
  statusHint: ShipmentTrackingStatusHint | null;
} {
  const text = input.text.trim();
  if (CAPTCHA_PATTERNS.some((pattern) => pattern.test(text))) {
    return { state: 'captcha', statusHint: null };
  }
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(text))) {
    return { state: 'blocked', statusHint: null };
  }
  if (PAYWALL_PATTERNS.some((pattern) => pattern.test(text))) {
    return { state: 'paywall', statusHint: null };
  }
  if (NOT_FOUND_PATTERNS.some((pattern) => pattern.test(text))) {
    return { state: 'not_found', statusHint: null };
  }

  const normalizedTrackingNumber = input.trackingNumber.trim().toLowerCase();
  const trackingContext = input.trackingContext ?? text;
  if (
    normalizedTrackingNumber.length > 0 &&
    !trackingContext.toLowerCase().includes(normalizedTrackingNumber)
  ) {
    return { state: 'irrelevant', statusHint: null };
  }

  for (const [statusHint, patterns] of STATUS_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(text))) {
      return { state: 'success', statusHint };
    }
  }

  return { state: 'irrelevant', statusHint: null };
}

export type ShipmentCloudRunCompletionStatus = 'succeeded' | 'partial' | 'failed';

export function deriveShipmentCloudRunStatus(input: {
  results: ShipmentTrackingSourceResult[];
  hasPresentation: boolean;
}): ShipmentCloudRunCompletionStatus {
  const successfulCount = input.results.filter((result) => result.state === 'success').length;

  if (successfulCount === 0) {
    return input.results.some((result) => result.state === 'not_found') ? 'partial' : 'failed';
  }

  const everySourceSucceeded = input.results.every((result) => result.state === 'success');
  return input.hasPresentation && everySourceSucceeded ? 'succeeded' : 'partial';
}

export function buildTrackingExcerpt(
  text: string,
  trackingNumber: string,
  maxLength = 4_000,
): string {
  const uniqueLines = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ),
  ];
  const combined = uniqueLines.join('\n');
  const trackingIndex = combined.toLowerCase().indexOf(trackingNumber.trim().toLowerCase());
  const start = trackingIndex > 1_000 ? trackingIndex - 1_000 : 0;
  const bounded = combined.slice(start, start + maxLength);
  if (!trackingNumber.trim()) return bounded;

  const escapedTrackingNumber = trackingNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return bounded.replace(new RegExp(escapedTrackingNumber, 'gi'), '[TRACKING_NUMBER]');
}

export function sourceStateLabel(state: ShipmentTrackingSourceState): string {
  switch (state) {
    case 'success':
      return 'Data received';
    case 'captcha':
      return 'Skipped: CAPTCHA';
    case 'blocked':
      return 'Blocked by source';
    case 'paywall':
      return 'Skipped: paid plan';
    case 'not_found':
      return 'No shipment found';
    case 'irrelevant':
      return 'Rejected: unrelated result';
    case 'not_configured':
      return 'Not configured';
    case 'timeout':
      return 'Timed out';
    case 'error':
      return 'Source error';
  }
}
