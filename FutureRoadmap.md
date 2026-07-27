# TikDL + NovaDL Future Roadmap

> **Status**: Planning — awaiting approval of Phase 1 architecture  
> **Principle**: TikTok must work perfectly at every phase. New platforms are added only when their provider is fully tested.

---

## Phase Overview

| Phase | Scope | Platforms Added | Frontend Changes | Timeline |
|-------|-------|----------------|-----------------|----------|
| **Phase 1** | Abstraction layer + TikTok adapter | TikTok only (refactored internally) | None (zero visible changes) | Current |
| **Phase 2** | Instagram provider + UI multi-platform | TikTok + Instagram | Platform selector appears, URL input adapts | After Phase 1 verified |
| **Phase 3** | YouTube provider | TikTok + Instagram + YouTube | YouTube download quality selector | After Phase 2 verified |
| **Phase 4** | Facebook + Twitter/X | 5 platforms total | Platform-specific display components | After Phase 3 verified |
| **Phase 5** | Pinterest + Snapchat + more | 7+ platforms | Auto-detect URL → route to correct provider | After Phase 4 verified |
| **Phase 6** | Auth + persistence + scaling | All platforms | Admin auth upgrade, user accounts | After Phase 5 verified |

---

## Phase 1: NovaDL Abstraction Layer (Current)

### Goal
Replace the hardcoded TikTok download engine with a pluggable provider system, while keeping the user experience exactly the same.

### What Changes (Internal Only)
- New `src/services/` directory with DownloadService, PlatformDetector, ProviderRegistry, NovaDLProvider interface, NovaDLResult format, NovaDLError standardisation, DownloadLogger
- TikTok providers wrapped as adapters (TikTokTikHubAdapter, TikTokRapidAPIAdapter)
- `/api/download/route.ts` refactored to use DownloadService
- Prisma schema updated (platform field on DownloadLog and ProviderStatus)
- Provider health monitoring activated
- Download logging to DB activated (was empty before)
- Structured logging with request IDs

### What Does NOT Change (User-Visible)
- Landing page UI/UX — same hero, same input, same download tabs
- Admin panel — same 6 tabs, same functionality
- Interstitial ad system — same countdown, same ad slots
- TikTok download quality — same No Watermark HD, MP3 Audio, Cover Image
- SEO, branding, sitemap, manifest — all unchanged

### Verification Criteria
- [ ] TikTok URL download works identically to current behavior
- [ ] Admin panel all tabs function correctly
- [ ] Ad system (interstitial, sidebar, banner, inline) works
- [ ] Analytics dashboard displays logged data
- [ ] Health endpoint reports provider status
- [ ] `bun run lint` passes with zero errors
- [ ] DownloadLog table gets populated on each download
- [ ] ProviderStatus table gets updated on health checks
- [ ] NovaDLResult → VideoInfo adapter produces identical frontend data

---

## Phase 2: Instagram Integration

### Goal
Add Instagram as the second platform. Users can paste Instagram URLs and download Reels, Posts, Stories, and IGTV content.

### What Changes
- New `src/services/providers/adapters/instagram/` with InstaLoaderAdapter or similar
- PlatformDetector gets Instagram URL patterns
- ProviderRegistry registers Instagram providers
- Frontend URL input accepts Instagram URLs alongside TikTok URLs
- **Platform auto-detection**: when user pastes an Instagram URL, the system routes to Instagram providers automatically — no manual platform selection needed
- Download result display adapts based on content type:
  - Reel → video download with thumbnail
  - Post → image carousel download (multiple images)
  - Story → video or image download
- Admin panel: "Platforms" tab shows Instagram as enabled, others as coming soon

### What Does NOT Change
- TikTok download flow — still works exactly as before
- Landing page design — same hero section, same features, same FAQ
- Interstitial ad system — same for both platforms
- Database schema — same models (platform field already added in Phase 1)

### Instagram-Specific Considerations
- Instagram requires authentication to access private content — `PRIVATE_CONTENT` error handling
- Instagram carousel posts have multiple images — `NovaDLResult.images[]` array
- Instagram Reels are similar to TikTok videos — `VIDEO_NO_WATERMARK` format
- Instagram Stories are ephemeral — may need `LIVE_STREAM` or `DELETED_CONTENT` error handling

### UI Design (Platform-Aware Display)
```
When user pastes TikTok URL:
  → Same UI as current: Video/Audio/Cover tabs

When user pastes Instagram URL:
  → Detect platform → Show Instagram download options:
  → Reel: Video download + Audio extract + Thumbnail
  → Post: Image carousel (swipeable) + Save All button
  → Story: Video/Image download + Expiry warning
```

---

## Phase 3: YouTube Integration

### Goal
Add YouTube as the third platform. Users can download YouTube videos with quality selection.

### What Changes
- New `src/services/providers/adapters/youtube/` with yt-dlp or similar adapter
- PlatformDetector gets YouTube URL patterns (youtube.com, youtu.be, shorts)
- ProviderRegistry registers YouTube providers
- YouTube download display: quality selector (4K, 1080p, 720p, 480p, 360p)
- YouTube audio: multiple bitrate options (128kbps, 256kbps, 320kbps)
- YouTube Shorts: treated similar to TikTok videos

### What Does NOT Change
- TikTok and Instagram download flows unchanged
- Landing page design unchanged
- Admin panel unchanged (YouTube appears as new enabled platform)

### YouTube-Specific Considerations
- YouTube has many quality tiers — `NovaDLResult.formats[]` must handle 6+ entries
- YouTube age-restricted content — `AGE_RESTRICTED` error handling
- YouTube live streams — `LIVE_STREAM` error for ongoing streams
- YouTube playlists — Phase 3 scope is single video only; playlist support in future phase
- yt-dlp is a Python-based tool — may need a mini-service (Python runtime) adapter

### UI Design (YouTube Quality Selector)
```
When user pastes YouTube URL:
  → Quality selector dropdown:
    → 4K (2160p) — if available
    → 1080p (Full HD) — most common
    → 720p (HD) — fallback
    → 480p (SD) — small file
  → Audio download:
    → MP3 320kbps
    → MP3 128kbps
  → Thumbnail download
```

---

## Phase 4: Facebook + Twitter/X Integration

### Goal
Add Facebook and Twitter/X as the fourth and fifth platforms.

### What Changes
- New provider adapters for Facebook and Twitter/X
- PlatformDetector gets Facebook and Twitter URL patterns
- Facebook: video downloads from public posts
- Twitter/X: video downloads from tweets, GIF downloads
- Admin: 5 platforms shown as enabled

### Facebook-Specific Considerations
- Facebook videos are embedded in complex page structures — provider may need server-side rendering
- Facebook private videos — `PRIVATE_CONTENT` error
- Facebook Watch URLs — separate pattern from regular post URLs

### Twitter-Specific Considerations
- Twitter/X video tweets — single video per tweet
- Twitter GIFs — should be downloadable as both GIF and MP4
- Twitter Spaces (audio) — future scope
- Rate limiting is aggressive on Twitter APIs

---

## Phase 5: Pinterest + Snapchat + More

### Goal
Expand to Pinterest, Snapchat, and other platforms as demand grows.

### What Changes
- Pinterest: pin image and video downloads
- Snapchat: story and spotlight downloads
- Reddit: video downloads from posts (potential)
- Tumblr: media downloads (potential)
- Platform auto-detection becomes primary UX — user just pastes any URL and the system figures out the platform

### Pinterest-Specific Considerations
- Pinterest pins are primarily images — `NovaDLResult.images[]` is the main output
- Pinterest video pins — `VIDEO_NO_WATERMARK` format
- Pinterest boards — collection download (future scope, Phase 5 is single pin only)

### Snapchat-Specific Considerations
- Snapchat stories are ephemeral — similar to Instagram Stories
- Snapchat Spotlight videos — similar to TikTok videos
- Snapchat requires authentication for private content

---

## Phase 6: Auth + Persistence + Scaling

### Goal
Upgrade infrastructure for production-scale multi-platform operation.

### What Changes
- **Admin authentication**: Replace client-side sessionStorage with server-side auth (next-auth or JWT middleware)
- **User accounts**: Optional user registration for download history persistence across devices (currently localStorage only)
- **Rate limiting**: Move from in-memory Map to database-backed or Redis-backed rate limiting
- **Analytics persistence**: Move analytics aggregation from SQLite to Supabase or dedicated analytics DB for scale
- **Provider load balancing**: Distribute requests across multiple provider instances based on health and latency
- **Download queue**: For platforms with slow providers, implement async download queue with progress tracking
- **CDN integration**: Cache downloaded media thumbnails and metadata for repeated requests
- **Error monitoring**: Integrate with error tracking service (e.g., Sentry) for production monitoring

### Scaling Considerations
- SQLite is fine for Phase 1-3 (single server, low traffic)
- PostgreSQL or Supabase needed for Phase 4-5 (multi-server, higher traffic)
- Redis needed for Phase 6 (rate limiting, caching, session management)
- Object storage (S3/OSS) for caching downloaded media metadata

---

## Platform Priority Matrix

| Platform | User Demand | Technical Complexity | Provider Availability | Phase |
|----------|------------|---------------------|----------------------|-------|
| **TikTok** | Highest | Low (already implemented) | TikHub + RapidAPI | Phase 1 |
| **Instagram** | Very High | Medium (carousel, auth) | Instaloader, various APIs | Phase 2 |
| **YouTube** | Very High | High (multi-quality, age-restriction) | yt-dlp, various APIs | Phase 3 |
| **Facebook** | High | High (page scraping, auth) | Limited public APIs | Phase 4 |
| **Twitter/X** | High | Medium (video tweets, GIF) | Various APIs | Phase 4 |
| **Pinterest** | Medium | Low (images, video pins) | Various APIs | Phase 5 |
| **Snapchat** | Medium | Medium (ephemeral, auth) | Limited APIs | Phase 5 |
| **Reddit** | Medium | Medium (video posts, auth) | Various APIs | Future |
| **Tumblr** | Low | Low (media posts) | Various APIs | Future |
| **Twitch** | Low | High (live streams, VODs) | Various APIs | Future |

---

## Risk Mitigation Per Phase

| Phase | Primary Risk | Mitigation |
|-------|-------------|------------|
| Phase 1 | Breaking TikTok downloads during refactor | Keep old providers/ directory until new service is verified; rollback plan for /api/download/route.ts |
| Phase 2 | Instagram auth requirements blocking downloads | Design clear PRIVATE_CONTENT error handling; support only public content initially |
| Phase 3 | yt-dlp requiring Python runtime | Use mini-services architecture for Python adapters; fallback to web APIs if available |
| Phase 4 | Facebook/Twitter aggressive rate limiting | Per-platform rate limits; provider rotation; request queuing |
| Phase 5 | Low-demand platforms wasting resources | Only implement when demand is confirmed; keep as "coming soon" until provider is tested |
| Phase 6 | Auth implementation breaking admin access | Gradual rollout: keep sessionStorage as fallback; test new auth in staging first |

---

## Success Metrics Per Phase

| Phase | Key Metric | Target |
|-------|-----------|--------|
| Phase 1 | TikTok download success rate | Same as current (no degradation) |
| Phase 1 | Download log coverage | 100% of requests logged to DB |
| Phase 1 | Provider health check coverage | All providers checked every 5 minutes |
| Phase 2 | Instagram download success rate | >90% for public Reels and Posts |
| Phase 2 | Platform detection accuracy | 100% for TikTok and Instagram URLs |
| Phase 3 | YouTube quality selection | All 4+ quality tiers available |
| Phase 4 | 5-platform support | All 5 platforms working simultaneously |
| Phase 5 | Auto-detection success | 95%+ of URLs correctly classified |
| Phase 6 | Auth reliability | Zero admin auth bypasses possible |

---

## Naming Convention

As platforms are added, the product naming evolves:

| Phase | Product Name | Tagline |
|-------|-------------|---------|
| Phase 1 | TikDL | "TikTok Video Downloader Without Watermark" (unchanged) |
| Phase 2 | TikDL + Instagram | "Download TikTok & Instagram Videos" |
| Phase 3 | TikDL + YouTube | "Download Videos from TikTok, Instagram & YouTube" |
| Phase 4+ | **NovaDL** (potential rebrand) | "Universal Video Downloader — Any Platform, Any Format" |

The rebrand from TikDL to NovaDL is optional and depends on business strategy. The architecture supports both:
- Keep "TikDL" branding with multi-platform support under the hood
- Rebrand to "NovaDL" as a universal downloader

Phase 1 explicitly requires: **No branding changes. No landing page changes. The product is still called TikDL and looks exactly the same.**

---

## Dependencies Roadmap

| Dependency | Phase 1 | Phase 2 | Phase 3 | Phase 4+ | Phase 6 |
|-----------|---------|---------|---------|----------|---------|
| **Next.js 16** | ✅ Current | ✅ Same | ✅ Same | ✅ Same | ✅ Same |
| **Prisma + SQLite** | ✅ Current | ✅ Same | ⚠️ Consider PostgreSQL | ⚠️ PostgreSQL recommended | ✅ PostgreSQL |
| **TikHub API** | ✅ Current | ✅ Same | ✅ Same | ✅ Same | ✅ Same |
| **RapidAPI** | ✅ Current | ✅ Same | ✅ Same | ✅ Same | ✅ Same |
| **Instaloader/API** | ❌ Not needed | ✅ New | ✅ Same | ✅ Same | ✅ Same |
| **yt-dlp** | ❌ Not needed | ❌ Not needed | ✅ New (mini-service) | ✅ Same | ✅ Same |
| **next-auth** | ❌ Unused (remove or keep) | ❌ Not needed | ❌ Not needed | ❌ Not needed | ✅ Implement |
| **Supabase** | ❌ Unused (keep or remove) | ❌ Optional | ❌ Optional | ⚠️ Recommended | ✅ Required |
| **Redis** | ❌ Not needed | ❌ Not needed | ❌ Not needed | ⚠️ Optional | ✅ Required |
| **Sentry/error tracking** | ❌ Not needed | ❌ Not needed | ⚠️ Optional | ✅ Recommended | ✅ Required |

---

## Open Questions (To Resolve Before Phase 1 Implementation)

1. **Should we remove unused dependencies (next-auth, zustand, tanstack, etc.) in Phase 1, or keep them for future phases?** Recommendation: keep for now, remove in Phase 6 cleanup.

2. **Should the `/api/download/route.ts` rate limiter stay in-memory for Phase 1, or move to DB-backed immediately?** Recommendation: keep in-memory for Phase 1, move to DB-backed in Phase 6.

3. **Should we keep the old `src/app/providers/` directory alongside the new `src/services/providers/` during Phase 1, or move files immediately?** Recommendation: keep both until Step 8 (the API route switch) is verified, then remove old directory in Step 10 cleanup.

4. **Should DownloadLog writes happen synchronously (blocking the response) or asynchronously (fire-and-forget)?** Recommendation: asynchronous — log after the response is sent, so logging doesn't add latency to the download flow.

5. **How often should provider health checks run?** Recommendation: every 5 minutes, configurable via Settings table.

6. **Should the frontend URL input change to accept all platform URLs in Phase 1, or stay TikTok-only?** Recommendation: stay TikTok-only in Phase 1. The PlatformDetector will classify URLs, but the frontend validation will still only accept TikTok URLs. In Phase 2, we expand the frontend validation.

7. **Should we rebrand from TikDL to NovaDL at some point, or keep TikDL forever?** Recommendation: keep TikDL for Phase 1-3. Evaluate rebrand based on user feedback and business strategy before Phase 4.

---

## Appendix: Existing Unused Infrastructure (Future Leverage)

| Asset | Current Status | Future Use |
|-------|---------------|------------|
| `next-auth` package | Installed, never used | Phase 6: proper admin auth + user accounts |
| `supabase` client | Created, never used | Phase 4+: persistent analytics, user data sync |
| `zustand` package | Installed, never used | Phase 2+: admin state management (replace useState sprawl) |
| `@tanstack/react-query` | Installed, never used | Phase 2+: server state management (provider health, analytics) |
| `@tanstack/react-table` | Installed, never used | Phase 2+: admin data tables (download logs, analytics) |
| `react-hook-form` + `zod` | Installed, never used | Phase 2+: admin form validation (ad settings, provider config) |
| `mini-services/` directory | Empty (.gitkeep only) | Phase 3: Python runtime for yt-dlp adapter |
| `DownloadLog` model | Schema exists, never written | Phase 1: populated by DownloadLogger |
| `Analytics` model | Schema exists, never populated | Phase 1+: populated by aggregation queries |
| `ProviderStatus` model | Schema exists, never updated | Phase 1: populated by health check system |
| `Settings` model | Schema exists, used for key-value | Phase 1: used for provider configuration |
