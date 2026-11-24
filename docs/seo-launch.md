# Search discovery for stock-simulator.in

The canonical website is https://www.stock-simulator.in. Public pages have individual titles, descriptions, canonical URLs, Open Graph and Twitter previews. The homepage includes WebSite, Organization and educational WebApplication structured data without fabricated ratings or trading performance.

The sitemap lists the homepage, stocks explorer, futures/options explorer, news, about, privacy and terms. It omits account pages, query-string filters and unverified client-resolved instrument routes. Omit lastModified until real per-page content update dates are available. Account and auth pages inherit noindex,follow; instrument detail routes override the parent stocks canonical and stay noindex until server-side instrument identity/content can be verified. These directives do not replace authentication.

Production robots rules allow public crawling and disallow API and selected account routes. Authentication is the access control; robots rules are not a security boundary. Vercel Preview builds have noindex metadata and disallow crawling. Public canonicals always point at the custom domain.

## After deploying this PR

1. Check https://www.stock-simulator.in/robots.txt and https://www.stock-simulator.in/sitemap.xml return 200, and sitemap URLs resolve successfully.
2. In Google Search Console, add a Domain property for stock-simulator.in. Copy the exact DNS TXT verification record Google provides into your DNS provider; do not guess a value. Verify ownership.
3. Submit https://www.stock-simulator.in/sitemap.xml in Search Console. Inspect the homepage and request indexing; check Google's selected canonical and rendered content.
4. Confirm apex (stock-simulator.in) redirects to www, and configure old Vercel production aliases to redirect to the custom domain if they remain publicly accessible. Canonical tags are signals; redirect configuration belongs in Vercel domain settings.
5. Monitor indexing, search queries, coverage and real-user Core Web Vitals. Structured data and sitemap availability do not guarantee ranking, rich results or immediate indexing.

## Useful content to publish next

Add server-rendered educational pages explaining delivery (CNC), intraday (MIS), options lot size and expiry, virtual trading and simulator limitations. Link them from the existing homepage/about page. Avoid mass-generated thin stock pages, fabricated live numbers, keyword stuffing or unverified compliance claims.

## Branding

The brand SVG is a lightweight vector interpretation of the approved cyan/blue/violet ribbon and ascending bars. The wordmark remains accessible live text. Regenerate browser, app and social assets with node scripts/generate-brand-icons.mjs inside frontend. No image library or client animation was added.


## Phase 1: indexing and signup measurement

- Search Console: submit the sitemap, then inspect each public URL and check Google-selected canonical, indexing and live test. Export Performance (Web, last 28 days and last 3 months) including Queries and Pages; export Page indexing as well. Compare equivalent periods and prioritize relevant non-brand queries with impressions and positions 4–20. Do not infer queries from aggregate totals.
- GA4 is disabled by default. Create a web data stream for https://www.stock-simulator.in; turn off Enhanced Measurement in the stream (including automatic history-based page views, form and site-search events). Disable Google signals, ads personalization and user-provided data collection. Do not enable automatic collection or ad integrations. Review privacy requirements before activation.
- Set NEXT_PUBLIC_GA_MEASUREMENT_ID=G-... in Vercel Production only, then rebuild/redeploy. The tag loads only on the canonical host (or local development) after explicit consent. Declining is equally available; the privacy page lets users change preferences. No analytics event includes account details or trades; private paths are grouped as /app, and referrers are reduced to origins. Campaign query parameters are intentionally omitted; attribution can be incomplete.
- sign_up fires only after the register response confirms account creation, not after login, failed registration or a button click. Mark sign_up as a key event in GA4. In an exploration, compare Total users and users who triggered sign_up by first user source/medium (google / organic), over the same date range. Signup user conversion = unique measured signup users / measured users. GA4 consent, blockers and attribution mean results are directional, not a database count. Search Console clicks are not the denominator.
- Validate with a clean browser and DevTools: no Google tag request before consent or after declining; after allowing, confirm one page_view per measured path and sign_up only on a successful registration. Verify failed registration/login do not emit sign_up. Check payloads for no personal data. Revoke on /privacy and confirm no further tag requests after reload. Test GA4 Realtime/DebugView with a dedicated test stream before production. Exclude your own test traffic.
- Run npm test, npm run lint, npm run build and npm run test:standalone in frontend. Check deployed sitemap XML and robots with curl and Search Console URL Inspection. No private Search Console or GA4 access is assumed.


## Phase 2: homepage keyword optimization

Search Console baseline (owner export dated 2026-11-24, Web search): stock simulator India 11 clicks / 34 impressions / position 10.44; stock simulator 7 / 64 / 10.72; Indian stock simulator 2 / 7 / 4.57; stocks simulator 0 / 11 / 9.55. Canonical homepage: 50 clicks / 398 impressions. These are low-volume observed queries, not keyword-volume forecasts.

Homepage title, description and social metadata explain the India-focused simulator and virtual-money paper trading. At the owner's request, the original hero heading, description, CTA and animated word layout are retained; the visible search-focused heading (H2) and description appear in the existing footer brand column with crawlable Stocks and Options links. Keep a single canonical homepage for this intent; no meta-keyword tag, keyword stuffing, new indexable routes or artificial ratings. Existing section IDs, animation components, lazy loading, and private-page noindex rules remain. The original Open Dashboard CTA opens login for guests and routes signed-in visitors to their dashboard; the separate signup action remains available. Existing footer destinations are described more accurately and news is linked. Sample figures stay clearly labelled; no claims of live homepage quotes, guaranteed outcomes or exchange execution.

Validation: run frontend npm test, npm run lint, npm run build, npm run test:standalone and npm run test:e2e; inspect desktop/mobile homepage and signup/login interactions on preview. Existing performance comparison remains enabled; the original hero copy is retained; compare the same viewport/network and inspect the revised footer and other below-the-fold copy rather than assuming identical pixels. After approval and production deploy, inspect the canonical URL in Search Console and request indexing if appropriate; monitor equivalent 28-day query/page reports, CTR and measured signup users. Google may rewrite the title or snippet; rankings are not guaranteed. Phase 3 educational pages remain out of scope.
