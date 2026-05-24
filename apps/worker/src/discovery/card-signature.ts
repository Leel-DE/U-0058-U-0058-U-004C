/**
 * Generate a stable structural "signature" for a candidate card. Cards on
 * a category page almost always share the same DOM shape; grouping by
 * signature lets us:
 *   - boost the score of candidates whose siblings also score well
 *   - reject one-off elements that happen to score high by coincidence
 *     (e.g. a promo banner with a price)
 *   - emit a single repeated CSS selector for the whole grid.
 */
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
type DomNode = AnyNode;

/** Take only the class tokens that look "structural" — drop utility/random
 *  ones likely to differ between cards (Tailwind hashes, runtime ids, …). */
function structuralClasses(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .filter((t) => !/^(?:hover|focus|active|md|lg|sm|xl|2xl):/i.test(t))
    .filter((t) => !/^(?:p|m|w|h|gap|grid|flex|text|bg|border|rounded|opacity|order)-/i.test(t))
    .filter((t) => !/^[a-z]{1,3}-[0-9.\\/]+$/i.test(t)) // tailwind utilities
    .filter((t) => !/^_?[a-z0-9]{6,}__?[a-z0-9]{4,}$/i.test(t)) // css-modules hashes
    .filter((t) => !/^css-[a-z0-9]{4,}$/i.test(t)) // emotion
    .filter((t) => !/^jsx-\d{4,}$/i.test(t)) // styled-jsx
    .map((t) => t.toLowerCase());
}

function tagOf(el: Cheerio<DomNode>): string {
  return (el.get(0) as { tagName?: string })?.tagName?.toLowerCase() ?? 'div';
}

function depth(el: Cheerio<DomNode>): number {
  return el.parents().length;
}

function childTagPattern(el: Cheerio<DomNode>): string {
  const tags = el
    .children()
    .toArray()
    .slice(0, 6)
    .map((c) => ((c as { tagName?: string }).tagName ?? '').toLowerCase());
  return tags.join('>');
}

/** Compose a deterministic signature string. Two elements with the same
 *  signature look structurally identical from the parser's perspective. */
export function signatureOf(el: Cheerio<DomNode>): string {
  const tag = tagOf(el);
  const cls = structuralClasses(el.attr('class')).sort().join('.');
  const role = el.attr('role') ?? '';
  const itemtype = (el.attr('itemtype') ?? '').replace(/^.*\//, '');
  const children = childTagPattern(el);
  const d = depth(el);
  return [tag, cls, role, itemtype, children, `d${d}`].join('|');
}

export interface SignatureGroup<T> {
  signature: string;
  members: T[];
}

export function groupBySignature<T>(items: T[], getSignature: (it: T) => string): SignatureGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const sig = getSignature(it);
    const arr = map.get(sig) ?? [];
    arr.push(it);
    map.set(sig, arr);
  }
  return [...map.entries()]
    .map(([signature, members]) => ({ signature, members }))
    .sort((a, b) => b.members.length - a.members.length);
}

/** Build a stable, repeating CSS selector that uniquely targets all members
 *  of a signature group. Prefers semantic / explicit data-* hooks. */
export function selectorForGroup($: CheerioAPI, group: SignatureGroup<Cheerio<DomNode>>): string {
  const first = group.members[0];
  if (!first) return '';
  const tag = tagOf(first);

  // 1. data-* product attribute → strongest, never visually generated.
  for (const attr of ['data-product-id', 'data-sku', 'data-variant-id', 'data-article-id', 'data-product']) {
    if (first.attr(attr) !== undefined) {
      const selector = `[${attr}]`;
      if ($(selector).length === group.members.length) return selector;
      // fall through to combined tag+attr if attr exists elsewhere too
      if ($(`${tag}[${attr}]`).length === group.members.length) return `${tag}[${attr}]`;
    }
  }

  // 2. schema.org Product itemtype.
  if (/schema\.org\/Product\b/i.test(first.attr('itemtype') ?? '')) {
    const selector = '[itemtype*="schema.org/Product" i]';
    if ($(selector).length === group.members.length) return selector;
  }

  // 3. Stable structural class — the class shared by every member that
  //    yields exactly this group when used as a selector.
  const classCounts = new Map<string, number>();
  for (const m of group.members) {
    for (const cls of structuralClasses(m.attr('class'))) {
      classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
    }
  }
  const sharedAll = [...classCounts.entries()]
    .filter(([, n]) => n === group.members.length)
    .map(([cls]) => cls);
  for (const cls of sharedAll) {
    const sel = `${tag}.${CSS.escape(cls)}`;
    if ($(sel).length === group.members.length) return sel;
    const plainSel = `.${CSS.escape(cls)}`;
    if ($(plainSel).length === group.members.length) return plainSel;
  }
  if (sharedAll.length > 1) {
    const combined = sharedAll
      .slice(0, 3)
      .map((c) => `.${CSS.escape(c)}`)
      .join('');
    const sel = `${tag}${combined}`;
    if ($(sel).length === group.members.length) return sel;
  }

  // 4. Fallback: tag plus the most-discriminating class.
  if (sharedAll[0]) return `${tag}.${CSS.escape(sharedAll[0])}`;
  return tag;
}

// Polyfill CSS.escape (Node has it via globalThis in >=20 but be safe).
const CSS: { escape: (s: string) => string } = (() => {
  const g = globalThis as { CSS?: { escape?: (s: string) => string } };
  if (g.CSS?.escape) return { escape: g.CSS.escape.bind(g.CSS) };
  return {
    escape: (s: string) =>
      s.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, (ch) => `\\${ch}`),
  };
})();
