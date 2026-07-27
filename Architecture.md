# TikDL Architecture Audit

> **Status**: Audit complete — awaiting approval before implementation  
> **Date**: 2026-07-27  
> **Scope**: Full repository audit for NovaDL integration readiness

---

## 1. System Overview

TikDL is a Next.js 16 App Router application for downloading TikTok videos without watermarks. It features a public landing page with an interstitial ad countdown system, a comprehensive admin dashboard, and a provider-based download engine that abstracts TikHub and RapidAPI behind a common interface.

**Tech Stack**: Next.js 16 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui · Framer Motion · Prisma ORM (SQLite) · Sonner toasts · Zustand (installed, unused) · Supabase (installed, unused) · next-auth (installed, unused)

---

## 2. Dependency Map

### 2.1 Download Flow (End-to-End)

```
User pastes TikTok URL
  → page.tsx: handleSubmit() validates URL regex
  → page.tsx: startAdTimer() shows interstitial countdown
  → page.tsx: proceedAfterAd() sends POST /api/download
  → /api/download/route.ts: validates URL, rate-limits, calls getProvider()
  → providers/index.ts: getProvider() reads PROVIDER_NAME env var
  → providers/tikhub.ts OR providers/rapidapi.ts: fetchVideo(url)
  → External API (TikHub or RapidAPI)
  → Returns VideoMetadata to route
  → Route returns { success, data, provider, duration } to page
  → page.tsx: sets videoInfo state, renders download tabs
  → User clicks download → handleDownload() creates <a> element trick
```

### 2.2 Provider Architecture

```
providers/types.ts
  ├── VideoMetadata interface (TikTok-specific fields)
  └── DownloadProvider interface { name, fetchVideo(url) }

providers/index.ts
  ├── getProvider() → factory based on PROVIDER_NAME env var
  └── fetchWithFallback(url) → primary → fallback chain

providers/tikhub.ts
  └── TikHubProvider implements DownloadProvider
  └── Calls api.tikhub.io with Bearer token

providers/rapidapi.ts
  └── RapidAPIProvider implements DownloadProvider
  └── Calls tiktok-info.p.rapidapi.com with X-RapidAPI-Key
```

### 2.3 Admin Configuration Flow

```
Admin login (client-side sessionStorage)
  → admin/page.tsx: POST /api/admin/config
  → /api/admin/config/route.ts:
    ├── Upsert InterstitialConfig (countdown, autoDownload, titles)
    ├── Create/Update AdPlacement records (existingIds.has() check)
    ├── Delete AdPlacement records (with existence verification)
    └── Upsert Settings key-value pairs
  → Returns updated config to admin panel
```

### 2.4 Public Ad Config Flow

```
page.tsx: useEffect fetches GET /api/config/ads
  → /api/config/ads/route.ts:
    ├── Reads InterstitialConfig from DB
    ├── Reads AdPlacement records (enabled + landing placements)
    ├── Categorizes: sidebarAds, bannerAds, inlineAds, interstitialAd
    → Returns structured ad data to page
```

### 2.5 Analytics Flow

```
admin/page.tsx: fetches GET /api/analytics
  → /api/analytics/route.ts:
    ├── Reads Analytics model (last 7 days)
    ├── Reads ProviderStatus model
    ├── Reads DownloadLog model (last 50)
    → Returns today, last7Days, summary, providers, recentLogs
```

### 2.6 Database Schema (Flat, No Relations)

```
User              → id, email, name, timestamps
Post              → id, title, content, published, authorId, timestamps (LEGACY)
InterstitialConfig → id, enabled, countdownDuration, autoDownload, popupTitle, popupDescription
AdPlacement       → id, name, template, enabled, type, placement, position, dimensions, adCode, description, priority
DownloadLog       → id, videoId, videoTitle, provider, success, responseTime, error, ipAddress, createdAt
Analytics         → id, date (unique), totalDownloads, successCount, failCount, avgResponseMs, uniqueVisitors
ProviderStatus    → id, name (unique), active, successRate, avgResponseMs, lastCheck
Settings          → id, key (unique), value
```

---

## 3. Download Engine Connection Points

Every place where the download engine is connected or referenced:

| File | Line/Area | Connection Type | Coupling Level |
|------|-----------|-----------------|---------------|
| `src/app/providers/types.ts` | `VideoMetadata` interface | Data contract | **HIGH** — TikTok-specific fields (noWatermarkUrl, withWatermarkUrl, audioUrl, cover) |
| `src/app/providers/types.ts` | `DownloadProvider` interface | Provider contract | **MEDIUM** — `fetchVideo(url)` returns TikTok-specific metadata |
| `src/app/providers/index.ts` | `getProvider()` | Provider factory | **HIGH** — hardcoded switch, env-var driven, no config DB |
| `src/app/providers/index.ts` | `fetchWithFallback()` | Fallback chain | **HIGH** — hardcoded TikHub→RapidAPI pair, no registry |
| `src/app/providers/tikhub.ts` | Entire class | TikTok-only provider | **HIGH** — TikHub API URL, TikTok response parsing |
| `src/app/providers/rapidapi.ts` | Entire class | TikTok-only provider | **HIGH** — RapidAPI TikTok endpoint, TikTok response parsing |
| `src/app/api/download/route.ts` | URL validation regex | Platform gate | **HIGH** — `tiktok\.com` regex rejects all other platforms |
| `src/app/api/download/route.ts` | Error handling | Error mapping | **MEDIUM** — hardcoded PRIVATE_VIDEO, DELETED_VIDEO errors |
| `src/app/api/download/route.ts` | Retry logic | Provider-specific retry | **LOW** — generic 3-attempt with backoff |
| `src/app/api/download/route.ts` | Rate limiting | Infrastructure | **LOW** — generic IP-based rate limiter |
| `src/app/page.tsx` | `isValidTikTokUrl()` | URL validation | **HIGH** — TikTok regex in frontend |
| `src/app/page.tsx` | `VideoInfo` interface | Data contract | **HIGH** — mirrors TikTok-specific VideoMetadata |
| `src/app/page.tsx` | Download result rendering | UI display | **MEDIUM** — "No Watermark HD", "MP3 Audio", "Cover Image" tabs |
| `src/app/page.tsx` | Hero section text | Branding | **LOW** — "TikTok Video Without Watermark" |
| `src/app/page.tsx` | FAQ items | Content | **LOW** — TikTok-specific FAQ text |
| `src/app/admin/page.tsx` | `FUTURE_PLATFORMS` | Platform list | **MEDIUM** — hardcoded list of 10 future platforms |
| `src/app/admin/page.tsx` | Provider config section | Admin UI | **MEDIUM** — displays provider status/latency |
| `prisma/schema.prisma` | `DownloadLog` model | DB logging | **MEDIUM** — has `provider` field but no `platform` field |
| `prisma/schema.prisma` | `ProviderStatus` model | DB monitoring | **MEDIUM** — has `name` field but no `platform` field |

---

## 4. Critical Coupling Analysis

### 4.1 Hardcoded TikTok Dependencies (Must Change)

1. **URL validation regex** — `/^https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/.+/i` in both `page.tsx` and `download/route.ts`. This is the single biggest blocker for multi-platform support. Any Instagram, YouTube, or Facebook URL will be rejected at the validation layer before reaching the download engine.

2. **`VideoMetadata` interface** — Contains TikTok-specific fields: `noWatermarkUrl`, `withWatermarkUrl`, `audioUrl`, `cover`. Other platforms have different output structures (YouTube has multiple quality tiers, Instagram has carousel posts, etc.). This interface cannot serve all platforms without a unified redesign.

3. **Provider implementations** — `TikHubProvider` and `RapidAPIProvider` both parse TikTok-specific response structures (`videoData.author.unique_id`, `videoData.video.play_addr.url_list`, etc.). Each new platform needs its own provider implementation with its own response parsing.

4. **Frontend `VideoInfo` interface** — Mirrors `VideoMetadata` exactly with TikTok-specific naming. The download result section assumes a single video with watermark/no-watermark/audio/cover tabs — this doesn't work for Instagram carousels, YouTube multi-quality, or Pinterest image boards.

### 4.2 Architecture-Level Dependencies (Must Abstract)

1. **`getProvider()` factory** — Uses a hardcoded switch statement and `PROVIDER_NAME` env var. No way to select provider based on URL platform. When the user pastes an Instagram URL, the system needs to route to an Instagram provider, not TikHub.

2. **`fetchWithFallback()` chain** — Hardcoded TikHub→RapidAPI fallback. A multi-platform system needs per-platform fallback chains (e.g., TikTok: TikHub→RapidAPI, Instagram: InstaProvider→BackupProvider).

3. **Error messages** — Hardcoded `PRIVATE_VIDEO` and `DELETED_VIDEO` in the download route. These are TikTok-specific error states. Other platforms have different error conditions (e.g., YouTube: AGE_RESTRICTED, Instagram: PRIVATE_ACCOUNT, Facebook: VIDEO_UNAVAILABLE).

### 4.3 Missing Infrastructure (Must Build)

1. **No platform detection** — There is no function that identifies which platform a URL belongs to. The system needs a URL classifier: given any URL, determine if it's TikTok, Instagram, YouTube, etc.

2. **No download logging** — The `DownloadLog` model exists in Prisma but `/api/download` never writes to it. Analytics data is never populated. The entire analytics/dashboard system is displaying zeros or seeded mock data.

3. **No provider health monitoring** — `ProviderStatus` model exists but no background process or cron updates it. The admin dashboard's "Provider Status" cards show stale/seeded data.

4. **No structured logging** — `console.log` and `console.error` are used throughout. No request IDs, no structured fields, no log aggregation.

5. **No server-side auth** — Admin authentication is client-side `sessionStorage`. No middleware, no JWT, no server-side session. The `next-auth` package is installed but never used.

6. **No application-level tests** — Zero unit tests, zero integration tests. Only infrastructure deployment tests exist in `tests/`.

---

## 5. Unused / Dead Code

| Item | Location | Status | Recommendation |
|------|----------|--------|---------------|
| `next-auth` dependency | `package.json` | Never imported | Remove or implement proper auth |
| `supabase` client | `src/lib/supabase.ts` | Created but unused in routes | Remove or integrate for analytics persistence |
| `zustand` | `package.json` | Installed, never imported | Remove or use for admin state management |
| `@tanstack/react-query` | `package.json` | Installed, never imported | Remove or use for server state |
| `@tanstack/react-table` | `package.json` | Installed, never imported | Remove or use for admin data tables |
| `react-hook-form` + `zod` | `package.json` | Installed, never imported | Remove or use for admin form validation |
| `Post` model | `prisma/schema.prisma` | Legacy scaffold, never queried | Remove from schema |
| `/api/route.ts` | `src/app/api/` | Hello world placeholder | Remove |
| `/api/export-zip/route.ts` | `src/app/api/` | Debug artifact from previous session | Remove |
| `/download-zip/page.tsx` | `src/app/` | Debug artifact from previous session | Remove |
| `use-toast.ts` hook | `src/hooks/` | shadcn toast hook, unused (sonner used instead) | Remove or consolidate |

---

## 6. File Size Analysis (Refactoring Candidates)

| File | Lines | Size | Issue |
|------|-------|------|-------|
| `src/app/admin/page.tsx` | 1,917 | 107 KB | Monolithic — contains 6 tabs, all state, all UI |
| `src/app/page.tsx` | 1,090 | 54 KB | Monolithic — contains download, ads, FAQ, history, interstitial |
| `src/app/globals.css` | 590 | 18 KB | Mixed concerns — landing styles + admin styles + ad styles |

Both page files are candidates for component extraction, but this is outside the scope of Phase 1. The NovaDL integration must work within the existing file structure first, then component extraction can happen in a later phase.

---

## 7. Data Flow Summary

```
┌───────────────────────────────────────────────────────────────┐
│                         FRONTEND                               │
│                                                               │
│  page.tsx                                                     │
│  ├── URL input + TikTok regex validation                      │
│  ├── Interstitial countdown (fetches ad config from DB)       │
│  ├── POST /api/download → receives VideoMetadata              │
│  ├── Renders download tabs (video/audio/cover)                │
│  └── History saved to localStorage                            │
│                                                               │
│  admin/page.tsx                                               │
│  ├── Client-side auth (sessionStorage)                        │
│  ├── GET /api/admin/config → interstitial + ads + settings    │
│  ├── POST /api/admin/config → save all config                 │
│  ├── GET /api/analytics → dashboard charts                    │
│  └── Platform grid (FUTURE_PLATFORMS hardcoded list)          │
└─────────────────────┬─────────────────────────────────────────┘
                      │
                      │  POST { url }
                      ▼
┌───────────────────────────────────────────────────────────────┐
│                      API ROUTES                                │
│                                                               │
│  /api/download/route.ts                                       │
│  ├── Rate limiting (in-memory Map, 20/hr/IP)                  │
│  ├── TikTok URL regex validation                              │
│  ├── getProvider() → TikHubProvider OR RapidAPIProvider       │
│  ├── 3-attempt retry with exponential backoff                 │
│  ├── Hardcoded error mapping (PRIVATE_VIDEO, DELETED_VIDEO)   │
│  └── Returns { success, data: VideoMetadata, provider, duration }
│                                                               │
│  /api/admin/config/route.ts                                   │
│  ├── GET: fetches interstitial + ads + settings from DB       │
│  ├── POST: upserts interstitial, creates/updates/deletes ads  │
│  └── Upserts settings key-value pairs                         │
│                                                               │
│  /api/config/ads/route.ts                                     │
│  ├── GET: public ad config (interstitial + categorized ads)   │
│                                                               │
│  /api/analytics/route.ts                                      │
│  ├── GET: 7-day analytics + provider status + recent logs     │
│                                                               │
│  /api/health/route.ts                                         │
│  ├── GET: DB connectivity check                               │
└─────────────────────┬─────────────────────────────────────────┘
                      │
                      │  getProvider().fetchVideo(url)
                      ▼
┌───────────────────────────────────────────────────────────────┐
│                    PROVIDER LAYER                              │
│                                                               │
│  providers/types.ts                                           │
│  ├── VideoMetadata: id, title, author, thumbnail, duration,   │
│  │   noWatermarkUrl, withWatermarkUrl, audioUrl, cover        │
│  └── DownloadProvider: { name, fetchVideo(url) → VideoMetadata }
│                                                               │
│  providers/index.ts                                           │
│  ├── getProvider() → env-var switch (tikhub/rapidapi)         │
│  └── fetchWithFallback() → primary → backup chain             │
│                                                               │
│  providers/tikhub.ts                                          │
│  └── TikHubProvider → calls api.tikhub.io                     │
│  └── Parses TikTok-specific response structure                │
│                                                               │
│  providers/rapidapi.ts                                        │
│  └── RapidAPIProvider → calls tiktok-info.p.rapidapi.com      │
│  └── Parses TikTok-specific response structure                │
└─────────────────────┬─────────────────────────────────────────┘
                      │
                      │  HTTP requests
                      ▼
┌───────────────────────────────────────────────────────────────┐
│                 EXTERNAL APIs                                  │
│                                                               │
│  TikHub API (api.tikhub.io)                                   │
│  ├── Bearer token auth (TIKHUB_API_KEY env var)              │
│  ├── TikTok video endpoint only                               │
│                                                               │
│  RapidAPI (tiktok-info.p.rapidapi.com)                        │
│  ├── X-RapidAPI-Key header (RAPIDAPI_KEY env var)            │
│  ├── TikTok video endpoint only                               │
└───────────────────────────────────────────────────────────────┘
                      │
                      │  Prisma queries
                      ▼
┌───────────────────────────────────────────────────────────────┐
│                    DATABASE (SQLite)                           │
│                                                               │
│  InterstitialConfig → countdown popup settings                │
│  AdPlacement → ad slots (template, placement, dimensions, code)
│  DownloadLog → EMPTY (never written to)                       │
│  Analytics → EMPTY (never populated)                          │
│  ProviderStatus → EMPTY (never updated)                       │
│  Settings → key-value config store                            │
│  User → unused                                               │
│  Post → legacy scaffold, unused                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 8. Risk Assessment for NovaDL Integration

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| URL validation blocks all non-TikTok URLs | **CRITICAL** | The TikTok regex in `page.tsx` and `download/route.ts` will reject any Instagram/YouTube/Facebook URL before it reaches the provider layer | Create platform detection module that classifies URLs before validation |
| VideoMetadata is TikTok-only | **CRITICAL** | The data contract has TikTok-specific fields that don't map to other platforms | Design unified `DownloadResult` with a `formats[]` array instead of fixed fields |
| Provider factory is hardcoded | **HIGH** | `getProvider()` uses a switch statement — cannot route URLs to platform-specific providers | Build provider registry that maps platform → provider chain |
| No download logging to DB | **HIGH** | Analytics dashboard shows zeros because `/api/download` never writes to DownloadLog | Implement structured logging in the download service layer |
| No provider health monitoring | **HIGH** | ProviderStatus model exists but no process updates it | Build health check system that periodically tests each provider |
| In-memory rate limiting | **MEDIUM** | Resets on server restart, not production-safe | Move to DB-backed or Redis rate limiting (later phase) |
| Client-side admin auth | **MEDIUM** | No server-side auth middleware, sessionStorage only | Implement proper auth in later phase (not Phase 1 scope) |
| Monolithic page files | **LOW** | 1090 and 1917 line files — hard to modify without breaking | Component extraction in later phase |

---

## 9. What Must NOT Change

The following are production features that must remain exactly as they are after NovaDL integration:

1. **Landing page UI/UX** — The hero section, download flow, interstitial popup, feature cards, FAQ, and history must look and behave identically for TikTok downloads.
2. **Admin panel** — All 6 tabs must work: Dashboard, Providers, Ads, Analytics, Settings, Platforms.
3. **Interstitial ad system** — Countdown popup, auto-proceed, ad slots (sidebar, banner, inline) must continue functioning.
4. **TikTok download quality** — No watermark HD, with watermark, MP3 audio, cover image must all still work.
5. **Prisma + SQLite database** — The database engine and ORM must remain unchanged.
6. **SEO metadata** — Title, description, Open Graph, Twitter cards, sitemap, manifest.json must remain.
7. **Branding** — TikDL name, logo (♪), color scheme (#FE2C55, #25F4EE, #4ADE80), Silbren attribution.
