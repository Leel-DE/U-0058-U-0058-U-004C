import { describe, expect, it } from 'vitest';
import { detectPaginationUrls } from './pagination-detector.js';

describe('detectPaginationUrls', () => {
  it('detects rel next and page params', () => {
    const urls = detectPaginationUrls('<a rel="next" href="/c?page=2">Next</a><a href="/c?page=3">3</a>', 'https://x.test/c');
    expect(urls).toContain('https://x.test/c?page=2');
    expect(urls).toContain('https://x.test/c?page=3');
  });
});

