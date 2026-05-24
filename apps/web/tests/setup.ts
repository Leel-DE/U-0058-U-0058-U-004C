import '@testing-library/jest-dom/vitest';

// Polyfills / globals shared by all test files.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  // jsdom in older Node sometimes lacks this; supply a deterministic stub.
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () =>
      '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padStart(12, '0'),
    configurable: true,
  });
}
