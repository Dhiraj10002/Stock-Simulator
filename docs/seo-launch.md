# Search discovery for stock-simulator.in

The canonical website is https://www.stock-simulator.in. Public pages have individual titles, descriptions, canonical URLs, Open Graph and Twitter previews. The homepage includes WebSite, Organization and educational WebApplication structured data without fabricated ratings or trading performance.

The sitemap lists the homepage, stocks explorer, futures/options explorer, news, about, privacy and terms. It omits account pages, query-string filters and unverified client-resolved instrument routes. There is no invented last-modified timestamp. Account and auth pages inherit noindex,follow; instrument detail routes override the parent stocks canonical and stay noindex until server-side instrument identity/content can be verified. These directives do not replace authentication.

Production robots rules allow public crawling and disallow /api/. Account pages remain crawlable so crawlers can see their noindex tag. Vercel Preview builds have noindex metadata and disallow crawling. Public canonicals always point at the custom domain.

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
