import { describe, expect, it } from 'vitest';
import { sessionStatus } from './session-manager.js';

describe('manual session state', () => {
  it('returns null for unknown sessions', () => {
    expect(sessionStatus('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

