# TikDL — Maintenance Handoff

> **Project Status: RELEASE COMPLETE — MAINTENANCE MODE**
>
> This document is the formal closure record for the TikDL project. It is
> maintained as a reference for future maintainers and is NOT a development
> backlog. Items listed under "Non-Blocking Future Maintenance" are
> informational only — they are not mandates, and none of them currently
> block production.

---

## 1. Final Production State

| Field | Value |
|---|---|
| Production URL | https://tikdl.leadforgeai.site/ |
| Final production commit | `6a0e93cbb498fd11a070a3b007b2c17de2f37519` (`6a0e93c`) |
| Commit subject | `phase13.1: fix thumbnail preview regression (SSRF allowlist)` |
| Deployment platform | Vercel |
| Framework | Next.js 16.1.3 (App Router, Turbopack build) |
| Language | TypeScript 5 |
| Database | Prisma + SQLite |
| Deployment status | Live, healthy, manually user-verified |

### Completed Phases

| Phase | Commit | Summary |
|---|---|---|
| Phase 12 | `c08205f` | Fix production client-side navigation regression (GA4 architecture split) |
| Phase 13 | `7ec2838` + `cf24d8d` | Final production/security audit (SSRF suffix validation, redirect validation, login cleanup, a11y) |
| Phase 13.1 | `6a0e93c` | Thumbnail preview regression fix (added `tiktokcdn-us.com` / `-sg.com` / `-va.com` to SSRF allowlist) |
| Phase 13.2 | (no commit) | Final verification-only audit — zero code changes, all signals green |

### User-Verified Production Behaviour

The following were manually tested against production after Phase 13.1
and confirmed working:

- Video downloads (MP4 HD, no watermark)
- Audio downloads (MP3)
- Video preview rendering
- Thumbnail rendering (Phase 13.1 regression confirmed fixed)
- Admin dashboard (login, stats, configuration)
- Client-side navigation between public pages

---

## 2. Final Security Status

The security posture established across Phases 13 + 13.1 is intact and
verified by the SSRF regression suite (45/45 cases passing as of Phase 13.2).

### SSRF Protection (Proxy Endpoint)

Location: `src/app/api/proxy/route.ts`

- **Strict hostname suffix validation** — replaced the previous
  `String.includes()` substring matcher with a proper suffix-based
  `isAllowedHost()` function. A hostname is allowed only if it EXACTLY
  matches an allowlist entry OR ends with `.` + entry. This blocks
  attacker-controlled domains like `tiktok.evil.com` while still
  permitting legitimate subdomains like `p16-sign.tiktokcdn.com`.
- **TikTok regional CDN allowlist** — Phase 13.1 added three ByteDance-owned
  regional CDN domains to the allowlist:
  - `tiktokcdn-us.com` (e.g. `p19-common-sign.tiktokcdn-us.com` — serves thumbnail/cover images)
  - `tiktokcdn-sg.com` (Singapore region)
  - `tiktokcdn-va.com` (Virginia region)
  These are distinct registered domains from `tiktokcdn.com` — the
  `-us`/`-sg`/`-va` suffix is part of the registered domain, not a
  subdomain separator.
- **Post-redirect validation** — after `redirect: 'follow'`, the proxy
  re-validates `upstreamResponse.url` hostname against the same allowlist.
  Prevents SSRF via redirect to internal IPs (e.g. `169.254.169.254`).
- **HTTPS-only enforcement** — `http://` URLs are rejected with 400.
- **Internal IP blocking** — `localhost`, `127.0.0.1`, `169.254.169.254`
  (AWS metadata), `10.x`, `192.168.x`, `172.16.x`, `0.0.0.0`, `[::1]`,
  and `metadata.google.internal` (GCP metadata) are all blocked.

### SSRF Regression Suite

Location: `tests/regression/ssrf-host-check.mjs`

- **45 cases total — all PASS**
- 19 legitimate-host cases (must be ALLOWED)
- 17 attacker bypass attempts (must be BLOCKED)
- 9 internal/private targets (must be BLOCKED)

### Authentication & Admin

- **Authenticated admin APIs** — `/api/admin/*` routes verify session
  cookies before any privileged operation.
- **Secure admin cookies** — `HttpOnly`, `Secure`, `SameSite=Strict`.
- **HMAC session tokens** — server-side HMAC-signed tokens; not
  forgeable by clients.
- **Brute-force protection** — rate limiting on `/api/admin/auth/login`.
- **Admin pages noindex** — `/admin` carries `<meta name="robots" content="noindex, nofollow">` and canonical-to-homepage.

### Security Headers (Production)

Verified live on `https://tikdl.leadforgeai.site/`:

- `Content-Security-Policy` — full policy (see Section 5 for GA4 details)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=(), autoplay=(), vr=(), wake-lock=()`

### Secrets Hygiene

- **No tracked secrets** — `git grep` over `origin/main` finds no
  hardcoded API keys, OAuth tokens, service-account keys, or passwords.
- Only env-var NAMES are referenced in code (`process.env.TIKHUB_API_KEY`,
  `process.env.ADMIN_PASSWORD`, etc.).
- `.env` files are `.gitignore`d; only `.env.example` (template, no
  real values) is tracked.

---

## 3. Final SEO / Google Status

All signals verified live during Phase 13.2 against the production URL
using a Googlebot user-agent.

### robots.txt (https://tikdl.leadforgeai.site/robots.txt)

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: https://tikdl.leadforgeai.site/sitemap.xml
```

- Public pages crawlable.
- Admin and API correctly excluded.
- Sitemap declared.

### sitemap.xml (https://tikdl.leadforgeai.site/sitemap.xml)

- **6 URLs** — all HTTPS, all production domain, no admin/API, no
  `/tools` (intentionally noindex), no duplicates, no malformed entries.
- URLs: `/`, `/about`, `/contact`, `/privacy`, `/terms`, `/dmca`.
- Valid XML, HTTP 200.

### Canonical Audit

| Page | Canonical |
|---|---|
| `/` | `https://tikdl.leadforgeai.site` |
| `/about` | `https://tikdl.leadforgeai.site/about` (self) |
| `/contact` | `https://tikdl.leadforgeai.site/contact` (self) |
| `/privacy` | `https://tikdl.leadforgeai.site/privacy` (self) |
| `/terms` | `https://tikdl.leadforgeai.site/terms` (self) |
| `/dmca` | `https://tikdl.leadforgeai.site/dmca` (self) |
| `/tools` | `https://tikdl.leadforgeai.site` (intentional — noindex page) |
| `/admin` | `https://tikdl.leadforgeai.site` (intentional — noindex page) |

No localhost canonical, no Vercel canonical, no HTTP canonical, no
www/non-www mismatch, no trailing-slash inconsistency, no duplicate
canonicals.

### Googlebot Behaviour

- Googlebot UA receives **HTTP 200** on the homepage.
- Response body is **byte-identical** to the normal-browser response
  (40727 bytes both) — no UA-conditional rendering, no bot-specific
  challenge, no redirect loop.
- `<meta name="robots" content="index, follow"/>` present.
- No `X-Robots-Tag` header.
- GSC verification token `OFl83K9u-oddgOWFwkUaOn7nJYfXPnMXa1EAxduS1oI`
  present in homepage HTML.

### GSC Indexing Status — Classification

**Classification: B) TECHNICALLY INDEXABLE — GOOGLE INDEXING DECISION/PENDING**

GSC currently reports "URL is not on Google" / "Crawled - currently not
indexed" while the live test reports "URL is available to Google".

**This is not contradictory, and not a technical defect.**

- The live test confirms the page is crawlable and indexable NOW.
- The stored "not indexed" state reflects a prior Google indexing
  decision that may have been made on an older crawl.
- Google may re-evaluate indexing on its own schedule.

No code change is warranted. Forcing indexing via arbitrary SEO changes
is explicitly discouraged. The user may optionally use "Request
Indexing" once from GSC — this is a Google-side action, not a code
change.

---

## 4. Final Analytics (GA4) Status

| Field | Value |
|---|---|
| Measurement ID | `G-R5EXCNDGFK` (public identifier, not a credential) |
| Script source | `https://www.googletagmanager.com/gtag/js?id=G-R5EXCNDGFK` |
| Init script id | `ga4-init` (rendered via `next/script` `afterInteractive`) |
| Initial page_view | Automatic via `gtag('config', 'G-R5EXCNDGFK', { send_page_view: true })` |
| SPA route tracking | `GA4RouteTracker` client component (`usePathname()` + `useEffect`) |

### Phase 12 Architecture (Intact)

GA4 is split into two concerns, each in its own component. This split
must NOT be collapsed in future maintenance:

1. **`<GA4Scripts />`** — Server Component (no `'use client'`).
   Renders the gtag.js `<Script>` tags via `next/script` with
   `strategy="afterInteractive"`. Rendered ONCE from the root layout.
   Never re-renders on client-side navigation because it is a Server
   Component — this avoids the Phase 12 production bug where React
   reconciliation of next/script's imperatively-mutated DOM nodes threw
   `NotFoundError: Failed to execute 'insertBefore' on 'Node'`.

2. **`<GA4RouteTracker />`** — Client Component. Uses `usePathname()` +
   `useEffect` to fire a `page_view` event for client-side App Router
   navigations. Renders NO DOM — returns `null`. Because it renders
   nothing, it cannot cause a DOM reconciliation mismatch.

### Event Taxonomy (Funnel)

Defined in `src/lib/analytics.ts`:

- `page_view` — automatic on first load + client route changes
- `download_submit` — user submitted a TikTok URL
- `download_success` — metadata fetch returned a usable video card
- `download_error` — fetch failed OR returned unavailable content
- `video_download_click` — user clicked a video download button
- `audio_download_click` — user clicked an audio download button
- `ad_interstitial_shown` — countdown popup displayed
- `ad_interstitial_completed` — countdown completed, download proceeded
- `ad_interstitial_skipped` — user dismissed via Escape / manual skip

### Privacy

- **No PII is intentionally sent to GA4.** Only aggregate, non-identifying
  parameters are transmitted: `download_type` (`video`/`audio`),
  `download_result` (`success`/`failure`), `platform` (`tiktok`).
- **No TikTok URLs, video IDs, usernames, provider names, error
  messages, or IP addresses** are sent to GA4.

### No-Duplicate-Initialization Guarantee

- The `ga4-init` inline script contains exactly one `gtag('config', ...)`
  call (with `send_page_view: true`) — fires the initial page_view.
- `GA4RouteTracker`'s `useEffect` only fires `gtag('event', 'page_view', ...)`
  on subsequent route changes (gated by `typeof window.gtag !== 'function'`
  to avoid firing before gtag.js loads, preventing duplicate initial
  page_view under normal timing).

### No-Op Safety

Both components render nothing and fire no events when
`NEXT_PUBLIC_GA_MEASUREMENT_ID` is missing or empty. The site continues
to work normally — analytics is strictly non-critical.

### GA4 CSP Permissions

The production CSP permits exactly what GA4 requires — no broad
wildcards added specifically for GA4:

- `script-src` includes `https://www.googletagmanager.com` (loads gtag.js)
  and `'unsafe-inline'` (the `ga4-init` inline script + Next.js runtime).
- `connect-src` is `'self' https:` — permits collect pings to
  `https://www.google-analytics.com/g/collect`.

### GA4 Dashboard Access — Classification

**EXTERNAL / ACCOUNT / NETWORK-SIDE ISSUE — NOT A TIKDL CODE DEFECT**

If `analytics.google.com` cannot be opened from the user's browser, this
is unrelated to TikDL's GA4 implementation. The distinction:

- **GA4 event collection** (TikDL → Google servers): outbound traffic
  from the TikDL site, controlled by TikDL code + CSP. Verified working.
- **GA4 dashboard access** (user's browser → `analytics.google.com`):
  outbound traffic from the user's browser to Google's UI. NOT
  controlled by TikDL code.

If dashboard access is blocked, the cause is one of: account login
state, browser extensions, regional blocking, network filtering, or
browser-side issues — all external to TikDL.

---

## 5. Non-Blocking Future Maintenance

These items were discovered during the Phase 13 / 13.1 / 13.2 audits.
They are **informational only** — none of them currently block
production, and none of them warrant a new development phase.

> **Do NOT automatically fix any of these.** Do NOT create a new phase
> merely because these items exist. Do NOT commit anything unless a
> genuine production defect is conclusively demonstrated.

### 1. Next.js 16 `middleware.ts` → `proxy.ts` migration

- **Status**: Future-compatibility maintenance only.
- **Detail**: Next.js 16 emits a deprecation warning during `next build`
  indicating that the `middleware` file convention is deprecated in
  favour of `proxy`. The build still completes successfully (exit 0).
- **Action**: None required now. When migrating to a future Next.js
  major version, rename `src/middleware.ts` → `src/proxy.ts` and verify
  behaviour. Do NOT migrate merely to silence the warning.

### 2. Dependency vulnerability monitoring

- **Status**: Existing transitive-dependency audit findings.
- **Detail**: `npm audit` may report transitive dependencies with
  advisories. None currently affect production runtime in a way that
  blocks users.
- **Action**: Monitor advisories. **Do NOT run `npm audit fix --force`**
  (it can introduce breaking semver-major changes). Do NOT introduce
  breaking dependency changes merely to remove warnings. Apply
  targeted, reviewed patches only when a real exploitable path is
  demonstrated against this codebase.

### 3. Secondary provider health

- **Status**: TikHub and RapidAPI providers currently report `degraded`
  in `/api/health`. Primary provider (`tiktok-api-dl`) is `online` and
  downloads work.
- **Detail**: Provider-side availability is outside TikDL's control.
  The fallback pipeline (V1/V2/V3 race, first-success-wins) continues
  to deliver downloads via the primary provider.
- **Action**: Investigate only if (a) primary download reliability
  becomes a problem, or (b) provider credentials need verification.
  Do NOT rotate API keys preemptively — fetch pipeline is working.

### 4. Google indexing

- **Status**: GSC reports "Crawled - currently not indexed" for the
  homepage. All technical indexability signals are correct (see
  Section 3).
- **Detail**: Indexing is Google's decision, not a code defect. Google
  may take time to index even when all signals are correct.
- **Action**: None required in code. The user may optionally use
  "Request Indexing" once from GSC — this is a Google-side action.

---

## 6. Frozen / Do-Not-Touch List

The following were specifically stabilised during Phases 12–13.2 and
should NOT be modified unless a concrete regression is demonstrated:

- `src/components/analytics/GA4Scripts.tsx` — Phase 12 Server Component
- `src/components/analytics/GA4RouteTracker.tsx` — Phase 12 Client Component
- `src/lib/analytics.ts` — funnel event taxonomy
- `src/app/api/proxy/route.ts` — SSRF allowlist + redirect validation
- `src/app/api/download/route.ts` — download engine + URL validation
- `src/app/api/admin/auth/login/route.ts` — auth + brute-force protection
- `src/app/layout.tsx` — root layout + GA4 wiring + splash
- `next.config.ts` — CSP + security headers
- `public/robots.txt` + `public/sitemap.xml` — SEO configuration
- `tests/regression/ssrf-host-check.mjs` — SSRF regression suite

---

## 7. Validation Commands (Reference)

The following commands were used during Phase 13.2 to verify the final
state. Future maintainers can re-run them as a sanity check:

```bash
# TypeScript
npx tsc --noEmit

# ESLint
npx eslint .

# Regression tests
node tests/regression/run-all.mjs

# SSRF suite (45 cases)
node tests/regression/ssrf-host-check.mjs

# Production build
npx next build

# Production health probe
curl -sS https://tikdl.leadforgeai.site/api/health | python3 -m json.tool

# Googlebot simulation
curl -sS -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
  https://tikdl.leadforgeai.site/ -o /tmp/gb.html -w "STATUS=%{http_code}\nSIZE=%{size_download}\n"

# Sitemap / robots
curl -sS https://tikdl.leadforgeai.site/sitemap.xml
curl -sS https://tikdl.leadforgeai.site/robots.txt
```

---

## 8. Closure Statement

The TikDL project is complete and production-ready. No mandatory
development phase remains. Future work should be treated as optional
maintenance or feature development, not as unresolved release work.
