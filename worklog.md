# Production Hotfix Worklog

---
Task ID: 1-9
Agent: Main Agent
Task: Production hotfix for 9 issues

Work Log:
- Read all critical source files (page.tsx, download.ts, route.ts, proxy/route.ts, analytics/route.ts, logger.ts, layout.tsx, admin/page.tsx, config/ads/route.ts, etc.)
- Analyzed screenshot evidence from 5 uploaded screenshots
- Traced full download pipeline: Frontend → /api/download → DownloadService → Engine/Providers → result-to-display → VideoInfo → Frontend render
- Traced proxy pipeline: triggerProxyDownload → /api/proxy → upstream CDN → browser download

Issue 1 Fix (502 errors):
- Root cause: Vercel can return 502 (HTML) when serverless times out; proxy returns 502 on upstream failure; frontend HEAD check exposes status code
- Fix: page.tsx handles non-JSON 502 gracefully; proxy HEAD check never shows status code; download/route.ts never returns 500/502

Issue 2 Fix (Invalid URLs show "Too many requests"):
- Root cause: Frontend had `if (response.status === 429) throw 'Too many requests...'`; also catch block could leak internal errors
- Fix: ALL non-200 responses now show "Video unavailable"; catch block filters 502/500/429/etc.; 429 from API returns "Video unavailable" not rate limit message

Issue 3 Fix (Ads not appearing on frontend):
- Root cause: /api/config/ads was missing `between_result_recent` and `between_recent_features` placements; frontend was missing `hero_section` and `native_content` rendering
- Fix: Added missing placements to LANDING_PLACEMENTS and inlineAds filter; added hero_section and native_content rendering in page.tsx

Issue 4 Fix (Settings don't affect frontend):
- Root cause: layout.tsx had static `export const metadata` with hardcoded values; never read from DB
- Fix: Replaced with `generateMetadata()` that reads from DB Settings table; dynamic theme-color, siteName, metaTitle, metaDescription, ogImageUrl, robotsDirective; maintenance mode renders maintenance screen

Issue 5 Fix (Analytics inconsistency - Today=114, Total=0):
- Root cause: Logger wrote Analytics with UTC date string but analytics API read with local timezone date (setHours(0,0,0,0)); Analytics table empty → totalDownloads=0 from last7Days while todayLogCount=114 from DownloadLog
- Fix: Both logger and analytics API now use explicit UTC midnight Date objects; added DownloadLog-based fallback when Analytics table is empty

Issue 6-8 Fix (Admin dashboard fake data):
- Root cause: Mobile/Desktop 65%/35% was hardcoded estimate
- Fix: Set to 0 with "—" display when no device data; all other data already comes from real API endpoints

Issue 9 Fix (Favicon):
- Replaced icon-192.png and icon-512.png with resized versions of uploaded logo (2000x2000 → 192x192 and 512x512)

Verification:
- ESLint: All changed files pass
- TypeScript: tsc --noEmit passes
- Next.js build: Compiles successfully (16.4s)
- Git: Committed as 07d74e3, pushed to origin/main

Stage Summary:
- 9 files changed, 284 insertions, 129 deletions
- All 9 issues addressed with verified production fixes
- Build passes, typecheck passes, lint passes
