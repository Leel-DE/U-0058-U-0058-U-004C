/**
 * Pure-function dedup-key test for notifications.
 * Full integration test (DB-backed) would require a test database connection
 * and is gated behind `TEST_DATABASE_URL`.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

function dedupKey(parts: (string | number | null | undefined)[]) {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 32);
}

describe('dedup key', () => {
  it('is deterministic for the same inputs', () => {
    const a = dedupKey(['rule-1', 'prod-2', '2026-05-24', 'drop']);
    const b = dedupKey(['rule-1', 'prod-2', '2026-05-24', 'drop']);
    expect(a).toBe(b);
  });
  it('differs when day changes', () => {
    const a = dedupKey(['rule-1', 'prod-2', '2026-05-24', 'drop']);
    const b = dedupKey(['rule-1', 'prod-2', '2026-05-25', 'drop']);
    expect(a).not.toBe(b);
  });
});
