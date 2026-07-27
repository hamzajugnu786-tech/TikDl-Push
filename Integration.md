# NovaDL Integration Strategy

> **Status**: Strategy designed — awaiting approval  
> **Principle**: Insert an abstraction layer between existing code and the download engine. Zero changes to user-visible behavior for TikTok downloads.

---

## 1. Integration Architecture

### 1.1 Current Architecture (TikTok-Only)

```
Frontend (page.tsx)
  → POST /api/download { url }
  → URL validation (TikTok regex)
  → getProvider() → TikHubProvider OR RapidAPIProvider
  → fetchVideo(url) → TikTok-specific VideoMetadata
  → Frontend renders TikTok-specific download tabs
```

### 1.2 Target Architecture (NovaDL-Ready)

```
Frontend (page.tsx)
  → POST /api/download { url }
  → PlatformDetector.identify(url) → platform: "tiktok"
  → ProviderRegistry.getProviders(platform) → [TikHubAdapter, RapidAPIAdapter]
  → DownloadService.fetch(url, platform, providers)
  → ProviderAdapter.fetchVideo(url) → NovaDLResult (UNIFIED format)
  → NovaDLResult → Frontend renders platform-aware download UI
```

### 1.3 Layer Diagram

```
┌─────────────────────────────────────────┐
│            FRONTEND (unchanged)          │
│  page.tsx — URL input, download tabs    │
│  admin/page.tsx — config, analytics     │
└────────────────┬────────────────────────┘
                 │
                 │  POST /api/download { url }
                 ▼
┌─────────────────────────────────────────┐
│           API ROUTE LAYER               │
│  /api/download/route.ts                 │
│  ├── PlatformDetector.identify(url)     │
│  ├── Rate limiting (platform-aware)     │
│  └── Calls DownloadService             │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│         DOWNLOAD SERVICE                │
│  src/services/download.ts               │
│  ├── Validates URL per-platform rules   │
│  ├── Gets provider chain from registry  │
│  ├── Executes with retry + fallback     │
│  ├── Logs to DownloadLog (DB)           │
│  ├── Returns unified NovaDLResult       │
│  └── Standardises errors                │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│         PROVIDER REGISTRY               │
│  src/services/providers/registry.ts     │
│  ├── register(platform, adapter)        │
│  ├── getProviders(platform) → []        │
│  ├── Loaded from DB config              │
│  ├── Supports future platforms          │
└────────────────┬────────────────────────┘
                 │
                 │  provider chain for platform
                 ▼
┌─────────────────────────────────────────┐
│         PROVIDER ADAPTERS               │
│  src/services/providers/adapters/       │
│  ├── tiktok/tikhub.ts                   │
│  ├── tiktok/rapidapi.ts                 │
│  ├── (future) instagram/instaloader.ts  │
│  ├── (future) youtube/yt-dlp.ts         │
│  └── Each adapter:                      │
│      implements NovaDLProvider interface │
│      fetchVideo(url) → NovaDLResult     │
│      healthCheck() → ProviderHealth     │
└────────────────┬────────────────────────┘
                 │
                 │  HTTP requests
                 ▼
┌─────────────────────────────────────────┐
│         EXTERNAL APIs                   │
│  TikHub, RapidAPI, (future APIs)        │
└─────────────────────────────────────────┘
```

---

## 2. NovaDL Compatibility Audit

### 2.1 Reusable Modules (Keep, Wrap in Adapter)

| Module | Current Role | NovaDL Role | Action |
|--------|-------------|-------------|--------|
| `providers/types.ts` → `DownloadProvider` interface | Provider contract | Base for `NovaDLProvider` (extended) | Extend with `platform`, `healthCheck()`, `supportedFormats()` |
| `providers/tikhub.ts` → fetch logic | TikHub API calls | Wrapped as `TikTokTikHubAdapter` | Keep HTTP logic, change return type to `NovaDLResult` |
| `providers/rapidapi.ts` → fetch logic | RapidAPI calls | Wrapped as `TikTokRapidAPIAdapter` | Keep HTTP logic, change return type to `NovaDLResult` |
| `/api/download/route.ts` → retry + backoff | Retry mechanism | Move to `DownloadService` | Extract retry logic into service layer |
| `/api/download/route.ts` → rate limiting | Rate limiting | Keep in route, make platform-aware | Add per-platform rate limits |
| `prisma/schema.prisma` → DownloadLog | Log model | Extend with `platform` field | Add `platform` column to DownloadLog |
| `prisma/schema.prisma` → ProviderStatus | Health model | Extend with `platform` field | Add `platform` column to ProviderStatus |
| `prisma/schema.prisma` → Settings | Config store | Use for provider config | Already key-value, add provider config keys |

### 2.2 Conflicting Modules (Must Refactor)

| Module | Conflict | Resolution |
|--------|----------|------------|
| `VideoMetadata` interface | TikTok-specific fields (noWatermarkUrl, withWatermarkUrl, audioUrl, cover) | Replace with unified `NovaDLResult` containing a `formats[]` array |
| `getProvider()` factory | Hardcoded switch, env-var only, no platform routing | Replace with `ProviderRegistry` that routes by platform |
| `fetchWithFallback()` | Hardcoded TikHub→RapidAPI pair | Replace with registry-driven per-platform fallback chains |
| URL validation regex | TikTok-only regex in frontend and API | Replace with `PlatformDetector` that classifies URLs by domain pattern |
| Error constants | PRIVATE_VIDEO, DELETED_VIDEO (TikTok-specific) | Replace with `NovaDLError` enum with standardised codes |
| Frontend `VideoInfo` interface | Mirrors TikTok-specific VideoMetadata | Replace with `NovaDLDisplayInfo` that adapts NovaDLResult for UI |

### 2.3 Duplicated Logic (Consolidate)

| Duplication | Location 1 | Location 2 | Resolution |
|-------------|-----------|-----------|------------|
| `formatCount()` function | `providers/tikhub.ts` | `providers/rapidapi.ts` | Move to `src/lib/format.ts` shared utility |
| URL regex validation | `page.tsx` (isValidTikTokUrl) | `download/route.ts` (tiktokRegex) | Move to `PlatformDetector` — single source of truth |
| Provider selection | `providers/index.ts` (getProvider) | `download/route.ts` (calls getProvider) | Move to `DownloadService` — route just calls service |
| Error handling pattern | `download/route.ts` (try/catch mapping) | `page.tsx` (error display) | Move to `NovaDLError` standardisation layer |

### 2.4 Incompatible Interfaces (Must Bridge)

| Interface A | Interface B | Incompatibility | Bridge |
|-------------|------------|-----------------|--------|
| `VideoMetadata.noWatermarkUrl` (string) | NovaDL unified formats (array) | Fixed field vs. dynamic array | `NovaDLResult.formats[]` with `{ type: "video_no_watermark", url, quality, extension }` |
| `VideoMetadata.withWatermarkUrl` (optional string) | NovaDL formats array | Optional field vs. array entry | Add as `{ type: "video_with_watermark", url }` in formats array |
| `VideoMetadata.audioUrl` (optional string) | NovaDL audio array | Single string vs. array | `NovaDLResult.audio[]` with `{ url, format, bitrate }` |
| `VideoMetadata.cover` (string) | NovaDL images array | Single image vs. array | `NovaDLResult.images[]` with `{ url, type: "cover" \| "thumbnail" }` |
| `DownloadProvider.fetchVideo(url)` | NovaDL provider interface | Single method vs. multi-method | Extend with `healthCheck()`, `supportedFormats()`, `platform` property |
| `getProvider()` env-var switch | Registry pattern | Static vs. dynamic | `ProviderRegistry` loaded from DB `Settings` table |

---

## 3. New Module Specifications

### 3.1 PlatformDetector (`src/services/platform-detector.ts`)

```typescript
interface PlatformInfo {
  platform: string;       // "tiktok" | "instagram" | "youtube" | etc.
  originalUrl: string;    // the raw URL the user pasted
  canonicalUrl: string;   // normalized URL for the provider
  confidence: number;     // 0-1 match confidence
}

class PlatformDetector {
  private patterns: Map<string, RegExp[]>;

  identify(url: string): PlatformInfo;
  // Maps URL domain patterns to platform identifiers
  // tiktok.com/vm.tiktok.com/vt.tiktok.com → "tiktok"
  // instagram.com → "instagram"
  // youtube.com/youtu.be → "youtube"
  // facebook.com → "facebook"
  // etc.
}
```

### 3.2 NovaDLResult (`src/services/types.ts`) — Unified Download Result

```typescript
interface NovaDLResult {
  success: boolean;
  message: string;            // Human-readable status
  platform: string;           // "tiktok" | "instagram" | etc.
  title: string;
  author: string;
  authorAvatar?: string;
  thumbnail: string;
  duration?: string;          // "3:45" or null for images
  formats: NovaDLFormat[];    // All available download formats
  audio: NovaDLAudio[];       // All available audio formats
  images: NovaDLImage[];      // All available images
  metadata: NovaDLMetadata;   // Platform-specific extras
}

interface NovaDLFormat {
  type: string;               // "video_no_watermark" | "video_with_watermark" | "video_hd" | etc.
  url: string;
  quality?: string;           // "1080p" | "720p" | "480p" | etc.
  extension: string;          // "mp4" | "webm" | etc.
  size?: string;              // "15MB" | estimated
  label: string;              // "No Watermark HD" — display text
}

interface NovaDLAudio {
  url: string;
  format: string;             // "mp3" | "aac" | "ogg" | etc.
  bitrate?: string;           // "128kbps" | etc.
  extension: string;          // "mp3"
  label: string;              // "MP3 Audio" — display text
}

interface NovaDLImage {
  url: string;
  type: string;               // "cover" | "thumbnail" | "carousel_1" | etc.
  extension: string;          // "jpg" | "png" | etc.
  label: string;              // "Cover Image" — display text
}

interface NovaDLMetadata {
  views?: string;
  likes?: string;
  comments?: string;
  shares?: string;
  [key: string]: string | undefined;  // Platform-specific extras
}
```

### 3.3 NovaDLProvider Interface (`src/services/providers/types.ts`)

```typescript
interface NovaDLProvider {
  name: string;               // "tikhub" | "rapidapi" | etc.
  platform: string;           // "tiktok" | "instagram" | etc.
  fetchVideo(url: string): Promise<NovaDLResult>;
  healthCheck(): Promise<ProviderHealth>;
  supportedFormats(): string[];  // ["video_no_watermark", "video_with_watermark", "audio_mp3", "image_cover"]
}

interface ProviderHealth {
  status: "online" | "offline" | "degraded";
  latency: number;            // ms
  availability: number;       // 0-1 success rate
  version?: string;
  lastCheck: Date;
}
```

### 3.4 ProviderRegistry (`src/services/providers/registry.ts`)

```typescript
class ProviderRegistry {
  private providers: Map<string, NovaDLProvider[]>;

  register(platform: string, provider: NovaDLProvider): void;
  getProviders(platform: string): NovaDLProvider[];  // Returns chain in priority order
  getAllPlatforms(): string[];
  getProviderByName(name: string): NovaDLProvider | undefined;

  // Load from DB config (Settings table) or env defaults
  loadFromConfig(): Promise<void>;
}
```

### 3.5 DownloadService (`src/services/download.ts`)

```typescript
class DownloadService {
  private registry: ProviderRegistry;
  private detector: PlatformDetector;

  async fetch(url: string): Promise<ServiceResult>;
  // 1. PlatformDetector.identify(url)
  // 2. Validate URL against platform rules
  // 3. registry.getProviders(platform)
  // 4. Try primary provider, fallback to next
  // 5. Log to DownloadLog (DB)
  // 6. Standardise errors via NovaDLError
  // 7. Return NovaDLResult

  async healthCheckAll(): Promise<Map<string, ProviderHealth>>;
  // Calls healthCheck() on every registered provider
  // Updates ProviderStatus in DB
}

interface ServiceResult {
  success: boolean;
  data?: NovaDLResult;
  error?: NovaDLError;
  provider: string;
  platform: string;
  duration: number;           // ms
  requestId: string;          // UUID for log correlation
}
```

### 3.6 NovaDLError (`src/services/errors.ts`) — Standardised Errors

```typescript
enum NovaDLErrorCode {
  INVALID_URL = "INVALID_URL",
  UNSUPPORTED_PLATFORM = "UNSUPPORTED_PLATFORM",
  PROVIDER_OFFLINE = "PROVIDER_OFFLINE",
  DOWNLOAD_FAILED = "DOWNLOAD_FAILED",
  RATE_LIMITED = "RATE_LIMITED",
  PRIVATE_CONTENT = "PRIVATE_CONTENT",
  DELETED_CONTENT = "DELETED_CONTENT",
  AGE_RESTRICTED = "AGE_RESTRICTED",
  GEO_BLOCKED = "GEO_BLOCKED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

class NovaDLError extends Error {
  code: NovaDLErrorCode;
  platform: string;
  provider?: string;
  requestId: string;
  originalError?: Error;

  toJSON(): object;  // Structured error for API responses
}
```

### 3.7 Structured Logging (`src/services/logger.ts`)

```typescript
interface DownloadLogEntry {
  requestId: string;          // UUID
  timestamp: Date;
  platform: string;
  provider: string;
  url: string;
  status: "success" | "error";
  executionTime: number;      // ms
  error?: NovaDLErrorCode;
  errorCode?: string;
}

class DownloadLogger {
  log(entry: DownloadLogEntry): Promise<void>;
  // Writes to DownloadLog table in DB
  // Also outputs structured console.log for debugging
}
```

---

## 4. Adapter Pattern for TikTok Providers

The existing `TikHubProvider` and `RapidAPIProvider` will be wrapped as adapters that translate TikTok-specific responses into the unified `NovaDLResult` format.

### 4.1 TikTokTikHubAdapter

```typescript
// src/services/providers/adapters/tiktok/tikhub.ts

export class TikTokTikHubAdapter implements NovaDLProvider {
  name = "tikhub";
  platform = "tiktok";

  async fetchVideo(url: string): Promise<NovaDLResult> {
    // 1. Call TikHub API (existing logic from providers/tikhub.ts)
    // 2. Parse TikTok-specific response (existing parsing logic)
    // 3. TRANSLATE into NovaDLResult format:
    //    - noWatermarkUrl → formats[0] { type: "video_no_watermark", ... }
    //    - withWatermarkUrl → formats[1] { type: "video_with_watermark", ... }
    //    - audioUrl → audio[0] { format: "mp3", ... }
    //    - cover → images[0] { type: "cover", ... }
    //    - views, likes → metadata.views, metadata.likes
  }

  async healthCheck(): Promise<ProviderHealth> {
    // Test TikHub API with a known-valid TikTok URL
    // Measure latency, check response status
  }

  supportedFormats(): string[] {
    return ["video_no_watermark", "video_with_watermark", "audio_mp3", "image_cover"];
  }
}
```

### 4.2 Translation Mapping (TikTok VideoMetadata → NovaDLResult)

| VideoMetadata field | NovaDLResult location |
|---------------------|-----------------------|
| `id` | `metadata.videoId` |
| `title` | `title` |
| `author` | `author` |
| `avatar` | `authorAvatar` |
| `thumbnail` | `thumbnail` + `images[0] { type: "thumbnail" }` |
| `duration` | `duration` |
| `views` | `metadata.views` |
| `likes` | `metadata.likes` |
| `noWatermarkUrl` | `formats[0] { type: "video_no_watermark", url, quality: "1080p", extension: "mp4", label: "No Watermark HD" }` |
| `withWatermarkUrl` | `formats[1] { type: "video_with_watermark", url, extension: "mp4", label: "With Watermark" }` |
| `audioUrl` | `audio[0] { url, format: "mp3", extension: "mp3", label: "MP3 Audio" }` |
| `cover` | `images[1] { type: "cover", url, extension: "jpg", label: "Cover Image" }` |

---

## 5. Config-Driven Provider Selection

### 5.1 Database Configuration (Settings Table)

Providers will be configured via the `Settings` table, allowing admin to change provider priority and enable/disable providers without code changes:

```sql
-- Example settings entries for provider config
INSERT INTO Settings (key, value) VALUES 
  ('provider_tiktok_primary', 'tikhub'),
  ('provider_tiktok_fallback', 'rapidapi'),
  ('provider_tiktok_enabled', 'true'),
  ('provider_instagram_primary', 'instaloader'),
  ('provider_instagram_fallback', 'backup_instagram'),
  ('provider_instagram_enabled', 'false');  -- disabled until ready
```

### 5.2 Registry Loading Flow

```
ProviderRegistry.loadFromConfig()
  ├── Reads Settings table from DB
  ├── For each platform, builds provider chain from settings:
  │   ├── provider_<platform>_primary → first adapter
  │   ├── provider_<platform>_fallback → second adapter
  │   ├── provider_<platform>_enabled → skip if "false"
  ├── Falls back to PROVIDER_NAME env var for defaults
  └── Registers all enabled adapters
```

---

## 6. Frontend Compatibility Bridge

### 6.1 NovaDLResult → VideoInfo Adapter (Frontend)

The frontend currently uses a `VideoInfo` interface that mirrors TikTok-specific `VideoMetadata`. Instead of rewriting the entire frontend, we create a **display adapter** that translates `NovaDLResult` back into the shape the frontend expects:

```typescript
// src/lib/result-to-display.ts

function adaptResultForDisplay(result: NovaDLResult): VideoInfo {
  // For TikTok: extract familiar fields from NovaDLResult
  const noWatermark = result.formats.find(f => f.type === "video_no_watermark");
  const withWatermark = result.formats.find(f => f.type === "video_with_watermark");
  const audio = result.audio[0];
  const cover = result.images.find(i => i.type === "cover");

  return {
    id: result.metadata.videoId || String(Date.now()),
    title: result.title,
    author: result.author,
    avatar: result.authorAvatar || '',
    thumbnail: result.thumbnail,
    duration: result.duration || '0:00',
    views: result.metadata.views || '',
    likes: result.metadata.likes || '',
    noWatermarkUrl: noWatermark?.url || '',
    withWatermarkUrl: withWatermark?.url || '',
    audioUrl: audio?.url || '',
    cover: cover?.url || result.thumbnail,
  };
}
```

This ensures **zero changes to the existing frontend UI** for TikTok downloads. The frontend still renders the same VideoInfo shape, same tabs, same buttons. The translation happens in the API response before sending to the frontend.

### 6.2 Platform-Aware Frontend (Future Phase)

In Phase 2+ when we actually add multi-platform support to the frontend, we'll replace `VideoInfo` with a platform-aware renderer:

```typescript
// Future: Platform-aware download display
function renderDownloads(result: NovaDLResult) {
  switch (result.platform) {
    case "tiktok":
      return <TikTokDownloadTabs result={result} />;
    case "instagram":
      return <InstagramDownloadGrid result={result} />;
    case "youtube":
      return <YouTubeQualitySelector result={result} />;
    default:
      return <GenericDownloadList result={result} />;
  }
}
```

But for Phase 1, the frontend stays unchanged.

---

## 7. File Structure After Phase 1

```
src/
├── app/
│   ├── page.tsx                     (UNCHANGED — still uses VideoInfo)
│   ├── admin/page.tsx               (MINOR UPDATE — registry display)
│   ├── layout.tsx                   (UNCHANGED)
│   ├── not-found.tsx                (UNCHANGED)
│   ├── globals.css                  (UNCHANGED)
│   ├── api/
│   │   ├── download/route.ts        (REFACTORED — calls DownloadService)
│   │   ├── admin/config/route.ts    (UNCHANGED)
│   │   ├── analytics/route.ts       (UNCHANGED)
│   │   ├── config/ads/route.ts      (UNCHANGED)
│   │   ├── health/route.ts          (UPDATED — includes provider health)
│   │   └── route.ts                 (REMOVED — dead code)
│   │   └── export-zip/route.ts      (REMOVED — debug artifact)
│   ├── download-zip/                (REMOVED — debug artifact)
│   ├── providers/                   (DEPRECATED — replaced by services/)
│   │   ├── types.ts                 (DEPRECATED — replaced by NovaDL types)
│   │   ├── index.ts                 (DEPRECATED — replaced by registry)
│   │   ├── tikhub.ts                (DEPRECATED — moved to adapters/tiktok/)
│   │   └── rapidapi.ts              (DEPRECATED — moved to adapters/tiktok/)
│   ├── sitemap.ts                   (UNCHANGED)
│
├── services/                        (NEW — NovaDL service layer)
│   ├── download.ts                  (NEW — DownloadService)
│   ├── platform-detector.ts         (NEW — PlatformDetector)
│   ├── logger.ts                    (NEW — DownloadLogger)
│   ├── errors.ts                    (NEW — NovaDLError)
│   ├── types.ts                     (NEW — NovaDLResult, NovaDLFormat, etc.)
│   ├── providers/
│   │   ├── registry.ts              (NEW — ProviderRegistry)
│   │   ├── types.ts                 (NEW — NovaDLProvider, ProviderHealth)
│   │   ├── adapters/
│   │   │   ├── tiktok/
│   │   │   │   ├── tikhub.ts        (NEW — TikHub adapter wrapping old logic)
│   │   │   │   ├── rapidapi.ts      (NEW — RapidAPI adapter wrapping old logic)
│   │   │   │   └── index.ts         (NEW — TikTok provider registration)
│   │   │   ├── instagram/           (EMPTY — placeholder for future)
│   │   │   ├── youtube/             (EMPTY — placeholder for future)
│   │   │   ├── facebook/            (EMPTY — placeholder for future)
│   │   │   ├── twitter/             (EMPTY — placeholder for future)
│   │   │   ├── pinterest/           (EMPTY — placeholder for future)
│   │   │   └── snapchat/            (EMPTY — placeholder for future)
│
├── lib/
│   ├── db.ts                        (UNCHANGED)
│   ├── utils.ts                     (UNCHANGED)
│   ├── supabase.ts                  (UNCHANGED — or REMOVED if unused)
│   ├── format.ts                    (NEW — shared formatCount utility)
│   ├── result-to-display.ts         (NEW — NovaDLResult → VideoInfo adapter)
│
├── hooks/                           (UNCHANGED)
├── components/ui/                   (UNCHANGED — shadcn primitives)
│
prisma/
├── schema.prisma                    (UPDATED — add platform fields)
```

---

## 8. Implementation Order (Phase 1)

The implementation must proceed in this exact order to avoid breaking the existing TikTok download flow:

### Step 1: Create Service Layer Types (No runtime impact)
- Create `src/services/types.ts` (NovaDLResult, NovaDLFormat, NovaDLAudio, NovaDLImage, NovaDLMetadata)
- Create `src/services/errors.ts` (NovaDLError, NovaDLErrorCode)
- Create `src/services/providers/types.ts` (NovaDLProvider, ProviderHealth)
- Create `src/lib/format.ts` (shared formatCount)

### Step 2: Create Platform Detector (No runtime impact)
- Create `src/services/platform-detector.ts`
- Define URL patterns for TikTok (plus placeholder patterns for other platforms)
- Test with known TikTok URLs

### Step 3: Create Provider Adapters (No runtime impact)
- Create `src/services/providers/adapters/tiktok/tikhub.ts` (wraps existing TikHub logic)
- Create `src/services/providers/adapters/tiktok/rapidapi.ts` (wraps existing RapidAPI logic)
- Create `src/services/providers/adapters/tiktok/index.ts` (TikTok registration)
- Create empty placeholder directories for future platforms

### Step 4: Create Provider Registry (No runtime impact)
- Create `src/services/providers/registry.ts`
- Implement register(), getProviders(), loadFromConfig()
- Register TikTok as the only active platform

### Step 5: Create Download Service (No runtime impact)
- Create `src/services/download.ts` (DownloadService)
- Create `src/services/logger.ts` (DownloadLogger)
- Implement fetch() with platform detection, provider chain, retry, logging

### Step 6: Create Frontend Compatibility Bridge (No runtime impact)
- Create `src/lib/result-to-display.ts`
- Implement adaptResultForDisplay() (NovaDLResult → VideoInfo)

### Step 7: Update Prisma Schema (DB migration)
- Add `platform` field to DownloadLog
- Add `platform` field to ProviderStatus
- Remove unused Post model
- Run `bun run db:push`

### Step 8: Switch API Route to New Service (BREAKING CHANGE — test thoroughly)
- Refactor `/api/download/route.ts` to use DownloadService instead of getProvider()
- Remove TikTok regex hardcoding — use PlatformDetector
- Use NovaDLResult → adaptResultForDisplay() for frontend compatibility
- Verify: TikTok downloads still work exactly as before

### Step 9: Update Health Route (Minor update)
- Update `/api/health/route.ts` to include provider health from DownloadService

### Step 10: Clean Up Dead Code
- Remove `src/app/providers/` directory (replaced by services/)
- Remove `src/app/api/route.ts` (hello world placeholder)
- Remove `src/app/api/export-zip/route.ts` (debug artifact)
- Remove `src/app/download-zip/` (debug artifact)
- Remove unused dependencies from package.json (next-auth, zustand, tanstack, etc. — or keep for future use)

### Step 11: Verify End-to-End
- Test TikTok URL download — must work identically to current behavior
- Test admin panel — all tabs must function
- Test ad system — interstitial, sidebar, banner, inline ads must work
- Test analytics dashboard — must display data
- Test health endpoint — must report provider status
- Run `bun run lint` — must pass with zero errors

---

## 9. Rollback Strategy

If any step breaks the TikTok download flow:

1. **Steps 1-6**: Pure additions — no runtime impact. Safe to keep even if later steps fail.
2. **Step 7**: DB schema change — reversible via `prisma migrate reset` ( destructive — backup DB first).
3. **Step 8**: The critical switch — if the new DownloadService breaks downloads, revert `/api/download/route.ts` to call `getProvider()` directly while keeping the new service layer code in place for future use.
4. **Steps 9-11**: Minor updates — easy to revert individually.

The old `src/app/providers/` directory should NOT be deleted until Step 8 is verified working. Keep both old and new code until the switch is confirmed stable.
