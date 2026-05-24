import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';

const KEEP_ATTRS = new Set([
  'class',
  'id',
  'itemprop',
  'itemscope',
  'itemtype',
  'data-testid',
  'data-test',
  'data-qa',
  'aria-label',
  'role',
  'href',
  'src',
  'alt',
]);

export interface CleanDomResult {
  html: string;
  hash: string;
  originalChars: number;
  cleanedChars: number;
  truncated: boolean;
}

export function cleanDom(html: string, maxChars = Number(process.env.AI_EXTRACTION_MAX_HTML_CHARS ?? 60_000)): CleanDomResult {
  const $ = cheerio.load(html, { scriptingEnabled: false });
  $('script, style, svg, noscript, iframe, canvas, video, audio, source, picture').remove();
  $('*')
    .contents()
    .each((_, node) => {
      if (node.type === 'comment') $(node).remove();
    });

  $('*').each((_, el) => {
    const attribs = { ...($(el).attr() ?? {}) };
    for (const name of Object.keys(attribs)) {
      const keep = KEEP_ATTRS.has(name) || name.startsWith('data-') && /test|qa|sku|price|product|id/i.test(name);
      if (!keep) $(el).removeAttr(name);
    }
  });

  $('*').each((_, el) => {
    const node = $(el);
    for (const child of node.contents().toArray()) {
      if (child.type !== 'text') continue;
      const text = $(child).text().replace(/\s+/g, ' ').trim();
      $(child).replaceWith(text.length > 180 ? `${text.slice(0, 180)}...` : text);
    }
  });

  let cleaned = $('body').html() || $.root().html() || '';
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
  const truncated = cleaned.length > maxChars;
  if (truncated) cleaned = cleaned.slice(0, maxChars);
  const hash = createHash('sha256').update(cleaned).digest('hex');
  return { html: cleaned, hash, originalChars: html.length, cleanedChars: cleaned.length, truncated };
}
