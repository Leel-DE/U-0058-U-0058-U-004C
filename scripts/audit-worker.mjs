/**
 * Spin up a tiny HTTP server that returns a known product page (JSON-LD),
 * call the worker against it, and assert the cascade extracts the right
 * fields. Also exercises the per-domain throttle (two back-to-back calls).
 */
import http from 'node:http';

const WORKER = process.env.WORKER_URL ?? 'http://localhost:4099';
const SECRET = process.env.WORKER_SHARED_SECRET ?? 'audit-secret';

const padding = '<p>filler '.repeat(200) + '</p>';
const html = `<!doctype html><html><head>
<title>Acme HP-2000</title>
<meta name="robots" content="all">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Acme HP-2000",
 "image":"https://cdn.example/x.jpg",
 "offers":{"@type":"Offer","price":"199.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
</script>
</head><body>
<h1>Acme HP-2000</h1>
<span class="price">€199,00</span>
${padding}
</body></html>`;

const robotsTxt = 'User-agent: *\nAllow: /\n';

const server = http.createServer((req, res) => {
  if (req.url === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(robotsTxt);
    return;
  }
  if (req.url === '/product') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  res.writeHead(404).end();
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/product`;
console.log(`▶ test server on :${port}`);

async function scrape(label) {
  const t0 = Date.now();
  const r = await fetch(`${WORKER}/scrape`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({
      url,
      strategy: 'cheerio',
      rules: {
        useJsonLd: true,
        useOpenGraph: true,
        titleSelector: 'h1',
        priceSelector: '.price',
      },
      respectRobots: true,
      userAgent: 'CompetitorRadarBot/1.0 (+audit@example.com)',
      timeoutMs: 10_000,
    }),
  });
  const json = await r.json();
  console.log(`\n[${label}] HTTP ${r.status}, total ${Date.now() - t0}ms`);
  console.log(JSON.stringify(json.ok ? { ok: true, data: json.data, meta: json.meta } : json, null, 2));
  return json;
}

const a = await scrape('first call');
const b = await scrape('second call (same domain — should be throttled by ~1s)');

let pass = true;
function check(cond, msg) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) pass = false;
}

console.log('\n▶ assertions:');
check(a.ok === true, 'first call ok');
check(a.data?.title === 'Acme HP-2000', 'title parsed');
check(a.data?.price === 199, 'price parsed (199)');
check(a.data?.currency === 'EUR', 'currency parsed (EUR)');
check(a.data?.availability === 'in_stock', 'availability parsed (in_stock)');
check(a.meta?.sourcePath === 'json-ld' || a.meta?.sourcePath === 'mixed', 'cascade used JSON-LD');
check(a.meta?.confidence > 0.7, 'confidence > 0.7');
check(a.meta?.robotsAllowed === true, 'robots.txt allowed');
check(b.ok === true, 'second call ok');

await new Promise((r) => server.close(r));
process.exit(pass ? 0 : 1);
