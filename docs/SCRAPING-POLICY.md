# Scraping policy

Competitor Radar is built around **ethical scraping**. The defaults you cannot override without explicit action:

- The crawler identifies itself with the User-Agent  
  `CompetitorRadarBot/1.0 (+contact@example.com)` (you should change the contact address before going to production).
- `robots.txt` is fetched, cached for 24 h, and consulted before every request. A `Disallow` for our path results in `skipped_robots` status — no fetch is attempted.
- Per-domain request delay defaults to **5 seconds** (minimum 2 s) and is enforced in-process by the worker.
- Inngest concurrency is keyed on `storeId` with `limit: 1`, so we never make two concurrent requests to the same store.
- The worker will **never** attempt to bypass authentication, captchas, anti-bot pages or paywalls. If a captcha is detected we mark the snapshot `captcha` and stop.
- We do not maintain a pool of residential proxies in MVP.

## Opt-out

If you operate a website and want us to stop crawling, please email the address in our User-Agent. We will add a global block within 24 hours.

## When scraping isn't appropriate

The app supports two first-class alternatives:

- **Manual snapshots** on the product page — enter the price by hand.
- **CSV import** — upload prices for many products at once.

We intentionally make these as low-friction as scraping so customers don't feel pressured to enable aggressive scraping behavior.
