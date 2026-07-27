/**
 * Migration Safety Layer — Phase 1 TikDL ↔ NovaDL Integration
 *
 * This module provides a rollback-safe migration foundation.
 * It documents:
 * 1. Dependency Map — every connection point to the download engine
 * 2. Regression Checklist — every feature that must remain unchanged
 * 3. Interface Compatibility Notes — bridges between old and new interfaces
 *
 * ⚠️  DO NOT modify any existing production code until the new service layer
 *     is fully implemented and verified. The old providers/ directory remains
 *     active until Step 8 (API route switch) is confirmed stable.
 */

// ============================================================================
// 1. DEPENDENCY MAP
// ============================================================================

/**
 * Every place where the download engine is connected:
 *
 * | File | Connection | Coupling | Must-Change? |
 * |------|-----------|----------|-------------|
 * | src/app/providers/types.ts | VideoMetadata + DownloadProvider | HIGH | NO — kept for backward compat, new types added alongside |
 * | src/app/providers/index.ts | getProvider() + fetchWithFallback() | HIGH | NO — kept until Step 8, then deprecated |
 * | src/app/providers/tikhub.ts | TikHubProvider class | HIGH | NO — wrapped by TikTokTikHubAdapter |
 * | src/app/providers/rapidapi.ts | RapidAPIProvider class | HIGH | NO — wrapped by TikTokRapidAPIAdapter |
 * | src/app/api/download/route.ts | URL validation + provider call + retry + error mapping | HIGH | YES — Step 8 switches to DownloadService |
 * | src/app/api/health/route.ts | DB connectivity check | LOW | YES — Step 9 adds provider health |
 * | src/app/page.tsx | VideoInfo interface + isValidTikTokUrl + download tabs | HIGH | NO — frontend unchanged, ResultMapper bridges |
 * | src/app/admin/page.tsx | Provider status display + FUTURE_PLATFORMS | MEDIUM | NO — admin unchanged in Phase 1 |
 * | prisma/schema.prisma | DownloadLog + ProviderStatus models | MEDIUM | YES — Step 7 adds platform field |
 * | src/lib/db.ts | PrismaClient singleton | LOW | NO — unchanged |
 * | src/lib/utils.ts | cn() utility | LOW | NO — unchanged |
 */

export const DEPENDENCY_MAP = {
  downloadEngine: {
    typesFile: 'src/app/providers/types.ts',
    indexFile: 'src/app/providers/index.ts',
    tikhubFile: 'src/app/providers/tikhub.ts',
    rapidapiFile: 'src/app/providers/rapidapi.ts',
  },
  apiRoutes: {
    download: 'src/app/api/download/route.ts',
    health: 'src/app/api/health/route.ts',
    analytics: 'src/app/api/analytics/route.ts',
    adminConfig: 'src/app/api/admin/config/route.ts',
    adsConfig: 'src/app/api/config/ads/route.ts',
  },
  frontend: {
    landingPage: 'src/app/page.tsx',
    adminPage: 'src/app/admin/page.tsx',
  },
  database: {
    schema: 'prisma/schema.prisma',
    client: 'src/lib/db.ts',
  },
} as const;

// ============================================================================
// 2. REGRESSION CHECKLIST
// ============================================================================

/**
 * Every feature that must remain EXACTLY as-is after integration:
 *
 * ✅ Landing page UI/UX — hero section, URL input, download flow
 * ✅ Landing page ad system — interstitial countdown, sidebar, banner, inline ads
 * ✅ Landing page FAQ — TikTok-specific questions and answers
 * ✅ Landing page history — localStorage-based recent downloads
 * ✅ Download tabs — "No Watermark HD", "With Watermark", "MP3 Audio", "Cover Image"
 * ✅ Admin panel — all 6 tabs (Dashboard, Providers, Ads, Analytics, Settings, Platforms)
 * ✅ Admin config save/load — interstitial settings, ad placements, key-value settings
 * ✅ Analytics dashboard — charts, provider status, recent logs
 * ✅ SEO — title, description, OG tags, Twitter cards, sitemap
 * ✅ Branding — TikDL name, logo (♪), color scheme
 * ✅ Download quality — no watermark HD video, MP3 audio, cover image all work
 * ✅ Error handling — "private or deleted" message still shown to users
 * ✅ Rate limiting — 20/hr/IP still enforced
 * ✅ Health endpoint — DB connectivity check still works
 * ✅ Prisma + SQLite — same database engine, same ORM
 */

export const REGRESSION_CHECKLIST = [
  'landing_page_ui_unchanged',
  'landing_page_ads_unchanged',
  'landing_page_faq_unchanged',
  'landing_page_history_unchanged',
  'download_tabs_unchanged',
  'admin_panel_all_tabs_unchanged',
  'admin_config_save_load_unchanged',
  'analytics_dashboard_unchanged',
  'seo_metadata_unchanged',
  'branding_unchanged',
  'download_quality_unchanged',
  'error_handling_unchanged',
  'rate_limiting_unchanged',
  'health_endpoint_unchanged',
  'prisma_sqlite_unchanged',
] as const;

// ============================================================================
// 3. INTERFACE COMPATIBILITY NOTES
// ============================================================================

/**
 * Bridge between old VideoMetadata and new NovaDLResult:
 *
 * Old (VideoMetadata)           New (NovaDLResult)
 * ─────────────────            ──────────────────
 * id                           → metadata.videoId
 * title                        → title
 * author                       → author
 * avatar                       → authorAvatar
 * thumbnail                    → thumbnail + images[type="thumbnail"]
 * duration                     → duration
 * views                        → metadata.views
 * likes                        → metadata.likes
 * noWatermarkUrl               → formats[type="video_no_watermark"].url
 * withWatermarkUrl             → formats[type="video_with_watermark"].url
 * audioUrl                     → audio[0].url
 * cover                        → images[type="cover"].url
 *
 * The ResultMapper (src/lib/result-to-display.ts) performs this translation
 * so the frontend still receives the exact same VideoInfo shape.
 *
 * The API response shape must also remain identical:
 *   { success: boolean, data: VideoInfo, provider: string, duration: number }
 *
 * This is guaranteed by the DownloadService returning a ServiceResult,
 * which the API route converts using ResultMapper before sending to frontend.
 */

export const INTERFACE_COMPAT = {
  oldVideoMetadataFields: [
    'id', 'title', 'author', 'avatar', 'thumbnail', 'duration',
    'views', 'likes', 'noWatermarkUrl', 'withWatermarkUrl', 'audioUrl', 'cover',
  ],
  novaDLResultFields: [
    'success', 'message', 'platform', 'title', 'author', 'authorAvatar',
    'thumbnail', 'duration', 'formats', 'audio', 'images', 'metadata',
  ],
  apiResponseShape: {
    success: 'boolean',
    data: 'VideoInfo (same shape as VideoMetadata)',
    provider: 'string',
    duration: 'number',
  },
} as const;
