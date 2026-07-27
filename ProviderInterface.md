# NovaDL Provider Interface Specification

> **Version**: 1.0.0  
> **Status**: Design — awaiting approval  
> **Scope**: Defines the contract every download provider must implement to integrate with the NovaDL engine.

---

## 1. Core Interface

### NovaDLProvider

Every provider — whether for TikTok, Instagram, YouTube, Facebook, or any future platform — must implement this interface:

```typescript
interface NovaDLProvider {
  /** Unique identifier for this provider (e.g. "tikhub", "rapidapi", "yt-dlp") */
  name: string;

  /** Platform this provider serves (e.g. "tiktok", "instagram", "youtube") */
  platform: string;

  /** Fetch video/content metadata and download URLs from the provider */
  fetchVideo(url: string): Promise<NovaDLResult>;

  /** Check if this provider is currently operational */
  healthCheck(): Promise<ProviderHealth>;

  /** List of download formats this provider can return */
  supportedFormats(): string[];
}
```

### Contract Rules

1. **`fetchVideo()` must always return a `NovaDLResult`** — no provider-specific response types. If the provider's raw API returns a different shape, the adapter must translate it into `NovaDLResult` internally.

2. **`fetchVideo()` must throw `NovaDLError` on failure** — no raw Error objects, no provider-specific error strings. All errors must be classified into `NovaDLErrorCode` values.

3. **`healthCheck()` must complete within 10 seconds** — if the provider doesn't respond in 10s, mark it as `offline` with the measured latency.

4. **`supportedFormats()` must return a static list** — this list doesn't change based on the URL. It describes the formats this provider CAN return, not what a specific URL will return (that's determined at fetch time).

5. **`name` must be unique across all providers** — the registry uses name as a key. Two providers cannot share the same name even if they serve different platforms.

6. **`platform` must match a PlatformDetector identifier** — the registry routes URLs to providers based on platform. The platform string must exactly match what `PlatformDetector.identify()` returns.

---

## 2. Unified Download Result

### NovaDLResult

```typescript
interface NovaDLResult {
  /** Whether the fetch was successful */
  success: boolean;

  /** Human-readable status message */
  message: string;

  /** Platform identifier (matches PlatformDetector output) */
  platform: string;

  /** Content title */
  title: string;

  /** Content author/creator name */
  author: string;

  /** Author avatar URL (optional) */
  authorAvatar?: string;

  /** Primary thumbnail/preview image URL */
  thumbnail: string;

  /** Duration string (e.g. "3:45") — null for non-video content */
  duration?: string;

  /** All available video/media formats */
  formats: NovaDLFormat[];

  /** All available audio formats */
  audio: NovaDLAudio[];

  /** All available images */
  images: NovaDLImage[];

  /** Platform-specific metadata */
  metadata: NovaDLMetadata;
}
```

### NovaDLFormat (Video/Media)

```typescript
interface NovaDLFormat {
  /** Format type identifier — standardised across providers */
  type: NovaDLFormatType;

  /** Direct download URL */
  url: string;

  /** Quality label (e.g. "1080p", "720p", "480p", "original") */
  quality?: string;

  /** File extension (e.g. "mp4", "webm", "mkv") */
  extension: string;

  /** Estimated file size (e.g. "15MB") — optional, provider may not know */
  size?: string;

  /** Human-readable display label for UI buttons (e.g. "No Watermark HD") */
  label: string;
}
```

### NovaDLFormatType (Standardised Type Enum)

```typescript
enum NovaDLFormatType {
  // Video formats
  VIDEO_NO_WATERMARK = "video_no_watermark",
  VIDEO_WITH_WATERMARK = "video_with_watermark",
  VIDEO_HD = "video_hd",
  VIDEO_SD = "video_sd",
  VIDEO_LOW = "video_low",
  VIDEO_ORIGINAL = "video_original",

  // Instagram-specific (future)
  CAROUSEL_ITEM = "carousel_item",
  REEL_VIDEO = "reel_video",
  STORY_VIDEO = "story_video",
  IGTV_VIDEO = "igtv_video",

  // YouTube-specific (future)
  VIDEO_4K = "video_4k",
  VIDEO_1080P = "video_1080p",
  VIDEO_720P = "video_720p",
  VIDEO_480P = "video_480p",
  VIDEO_360P = "video_360p",
  VIDEO_240P = "video_240p",

  // Pinterest-specific (future)
  PIN_IMAGE = "pin_image",
  PIN_VIDEO = "pin_video",
}
```

### NovaDLAudio

```typescript
interface NovaDLAudio {
  /** Direct download URL */
  url: string;

  /** Audio format/codec (e.g. "mp3", "aac", "ogg", "m4a") */
  format: string;

  /** Bitrate (e.g. "128kbps", "320kbps") — optional */
  bitrate?: string;

  /** File extension */
  extension: string;

  /** Human-readable display label */
  label: string;
}
```

### NovaDLImage

```typescript
interface NovaDLImage {
  /** Direct download URL */
  url: string;

  /** Image type identifier */
  type: NovaDLImageType;

  /** File extension (e.g. "jpg", "png", "webp") */
  extension: string;

  /** Human-readable display label */
  label: string;
}
```

### NovaDLImageType

```typescript
enum NovaDLImageType {
  COVER = "cover",
  THUMBNAIL = "thumbnail",
  AUTHOR_AVATAR = "author_avatar",
  CAROUSEL_IMAGE = "carousel_image",
  STORY_IMAGE = "story_image",
  PIN_IMAGE = "pin_image",
}
```

### NovaDLMetadata

```typescript
interface NovaDLMetadata {
  /** View count (formatted string, e.g. "1.5M") */
  views?: string;

  /** Like count */
  likes?: string;

  /** Comment count */
  comments?: string;

  /** Share count */
  shares?: string;

  /** Original content ID from the platform */
  videoId?: string;

  /** Description/caption text */
  description?: string;

  /** Upload date */
  uploadDate?: string;

  /** Content category/tags */
  tags?: string[];

  /** Allow any platform-specific extra fields */
  [key: string]: string | string[] | undefined;
}
```

---

## 3. Error Standardisation

### NovaDLErrorCode

```typescript
enum NovaDLErrorCode {
  /** The URL is malformed or empty */
  INVALID_URL = "INVALID_URL",

  /** The URL belongs to a platform not yet supported */
  UNSUPPORTED_PLATFORM = "UNSUPPORTED_PLATFORM",

  /** No provider for this platform is currently online */
  PROVIDER_OFFLINE = "PROVIDER_OFFLINE",

  /** The download failed after all retry attempts */
  DOWNLOAD_FAILED = "DOWNLOAD_FAILED",

  /** The user has exceeded the rate limit */
  RATE_LIMITED = "RATE_LIMITED",

  /** The content is private and cannot be accessed */
  PRIVATE_CONTENT = "PRIVATE_CONTENT",

  /** The content has been deleted by the author */
  DELETED_CONTENT = "DELETED_CONTENT",

  /** The content is age-restricted */
  AGE_RESTRICTED = "AGE_RESTRICTED",

  /** The content is blocked in the user's region */
  GEO_BLOCKED = "GEO_BLOCKED",

  /** The content requires authentication/login */
  AUTH_REQUIRED = "AUTH_REQUIRED",

  /** The content is a live stream (not downloadable yet) */
  LIVE_STREAM = "LIVE_STREAM",

  /** Catch-all for unexpected errors */
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}
```

### NovaDLError Class

```typescript
class NovaDLError extends Error {
  /** Standardised error code */
  code: NovaDLErrorCode;

  /** Which platform this error relates to */
  platform: string;

  /** Which provider threw this error (if known) */
  provider?: string;

  /** Request ID for log correlation */
  requestId: string;

  /** The original error from the provider (for debugging) */
  originalError?: Error;

  constructor(
    code: NovaDLErrorCode,
    message: string,
    platform: string,
    requestId: string,
    options?: { provider?: string; originalError?: Error }
  ) {
    super(message);
    this.name = "NovaDLError";
    this.code = code;
    this.platform = platform;
    this.requestId = requestId;
    this.provider = options?.provider;
    this.originalError = options?.originalError;
  }

  /** Convert to structured JSON for API responses */
  toJSON(): object {
    return {
      code: this.code,
      message: this.message,
      platform: this.platform,
      provider: this.provider,
      requestId: this.requestId,
    };
  }

  /** Convert to user-friendly display message */
  toDisplayMessage(): string {
    const messages: Record<NovaDLErrorCode, string> = {
      INVALID_URL: "The URL you entered is not valid. Please check and try again.",
      UNSUPPORTED_PLATFORM: "This platform is not supported yet. Stay tuned for future updates!",
      PROVIDER_OFFLINE: "Our download service is temporarily unavailable. Please try again later.",
      DOWNLOAD_FAILED: "We couldn't process this content. Please try again or try a different link.",
      RATE_LIMITED: "You've made too many requests. Please wait a moment and try again.",
      PRIVATE_CONTENT: "This content is private and cannot be downloaded.",
      DELETED_CONTENT: "This content has been deleted and is no longer available.",
      AGE_RESTRICTED: "This content is age-restricted and cannot be downloaded.",
      GEO_BLOCKED: "This content is not available in your region.",
      AUTH_REQUIRED: "This content requires login to view and cannot be downloaded.",
      LIVE_STREAM: "Live streams cannot be downloaded. Try again after the stream ends.",
      UNKNOWN_ERROR: "An unexpected error occurred. Please try again.",
    };
    return messages[this.code] || this.message;
  }
}
```

### Error Translation Map (TikTok-specific → NovaDL)

| Old Error (TikTok-specific) | NovaDLErrorCode | New Display Message |
|---|---|---|
| `PRIVATE_VIDEO` | `PRIVATE_CONTENT` | "This content is private and cannot be downloaded." |
| `DELETED_VIDEO` | `DELETED_CONTENT` | "This content has been deleted and is no longer available." |
| `RapidAPI returned status 403` | `DOWNLOAD_FAILED` | "We couldn't process this content. Please try again." |
| `TikHub API returned status 429` | `RATE_LIMITED` | "Too many requests. Please wait and try again." |
| `No download URL found` | `DOWNLOAD_FAILED` | "We couldn't find a download URL for this content." |
| `RAPIDAPI_KEY environment variable is required` | `PROVIDER_OFFLINE` | "Our download service is not configured. Please contact support." |
| Generic `Error` message | `UNKNOWN_ERROR` | "An unexpected error occurred. Please try again." |

---

## 4. Health Check Interface

### ProviderHealth

```typescript
interface ProviderHealth {
  /** Current operational status */
  status: "online" | "offline" | "degraded";

  /** Average response latency in milliseconds */
  latency: number;

  /** Success rate as a fraction (0.0 to 1.0) */
  availability: number;

  /** Provider API version (if available) */
  version?: string;

  /** Timestamp of the last health check */
  lastCheck: Date;
}
```

### Health Check Requirements

1. **Each provider must implement `healthCheck()`** — this method should make a lightweight API call to verify the provider is responsive. For TikHub/RapidAPI, this can be a simple authenticated ping or a known-valid URL test.

2. **Health checks should be non-destructive** — they should not count toward rate limits or create actual downloads.

3. **Health data must be persisted** — the `DownloadService` will call `healthCheck()` periodically and write results to the `ProviderStatus` database table.

4. **Health data must be accessible via API** — the `/api/health` route will include provider health in its response, and the admin dashboard will display it.

### Health Check Response Schema (for /api/health)

```typescript
interface HealthResponse {
  status: "ok" | "degraded" | "offline";
  database: "connected" | "disconnected";
  timestamp: string;
  providers: {
    [providerName: string]: ProviderHealth & {
      platform: string;
    };
  };
}
```

---

## 5. Provider Registry Interface

### ProviderRegistry

```typescript
class ProviderRegistry {
  /**
   * Register a provider for a platform.
   * Multiple providers per platform are allowed (for fallback chains).
   * Providers are ordered by priority (first = primary).
   */
  register(platform: string, provider: NovaDLProvider): void;

  /**
   * Get all providers for a platform, ordered by priority.
   * Returns empty array if platform is not registered.
   */
  getProviders(platform: string): NovaDLProvider[];

  /**
   * Get all registered platform identifiers.
   */
  getAllPlatforms(): string[];

  /**
   * Get a specific provider by its unique name.
   */
  getProviderByName(name: string): NovaDLProvider | undefined;

  /**
   * Check if a platform is registered and has at least one enabled provider.
   */
  isPlatformSupported(platform: string): boolean;

  /**
   * Load provider configuration from the database Settings table.
   * Reads provider_<platform>_primary, provider_<platform>_fallback, provider_<platform>_enabled entries.
   * Falls back to environment variables for defaults.
   */
  loadFromConfig(): Promise<void>;

  /**
   * Reload configuration (called when admin saves provider settings).
   */
  reloadConfig(): Promise<void>;
}
```

### Registry Storage (Settings Table)

The registry reads configuration from the Prisma `Settings` table, allowing admin to configure providers without code changes:

```sql
-- Configuration keys in Settings table
-- Format: provider_<platform>_<role>

provider_tiktok_primary     = "tikhub"       -- Primary TikTok provider
provider_tiktok_fallback    = "rapidapi"     -- Fallback TikTok provider
provider_tiktok_enabled     = "true"          -- TikTok platform enabled

provider_instagram_primary  = "instaloader"   -- (future)
provider_instagram_enabled  = "false"         -- Disabled until implemented

provider_youtube_primary    = "yt-dlp"        -- (future)
provider_youtube_enabled    = "false"         -- Disabled until implemented
```

### Default Configuration (Fallback)

If the Settings table has no provider configuration, the registry falls back to environment variables:

```bash
PROVIDER_NAME="tikhub"          # Primary provider (existing env var, reused)
PROVIDER_FALLBACK="rapidapi"    # Fallback provider (new env var)
```

---

## 6. Platform Detector Interface

### PlatformDetector

```typescript
class PlatformDetector {
  /**
   * Identify which platform a URL belongs to.
   * Returns PlatformInfo with platform identifier, canonical URL, and confidence.
   */
  identify(url: string): PlatformInfo;

  /**
   * Validate a URL against a specific platform's rules.
   * Returns true if the URL is a valid URL for the given platform.
   */
  validateForPlatform(url: string, platform: string): boolean;

  /**
   * Get all supported platform identifiers.
   */
  getSupportedPlatforms(): string[];
}

interface PlatformInfo {
  /** Platform identifier (e.g. "tiktok", "instagram", "youtube") */
  platform: string;

  /** The original URL as provided by the user */
  originalUrl: string;

  /** Normalized/canonical URL for provider consumption */
  canonicalUrl: string;

  /** Match confidence (0-1). 1 = exact match, lower = uncertain */
  confidence: number;
}
```

### URL Pattern Registry

```typescript
const PLATFORM_PATTERNS: Record<string, RegExp[]> = {
  tiktok: [
    /^https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/.+/i,
    /^https?:\/\/tiktok\.com\/.+/i,
  ],
  instagram: [
    /^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:p|reel|reels|tv|stories)\/.+/i,
  ],
  youtube: [
    /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?.+/i,
    /^https?:\/\/youtu\.be\/.+/i,
    /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/.+/i,
  ],
  facebook: [
    /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/.+\/videos\/.+/i,
    /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/watch\/.+/i,
    /^https?:\/\/fb\.watch\/.+/i,
  ],
  twitter: [
    /^https?:\/\/(?:www\.|m\.|x\.)?twitter\.com\/.+\/status\/.+/i,
    /^https?:\/\/(?:www\.|m\.|x\.)?x\.com\/.+\/status\/.+/i,
  ],
  pinterest: [
    /^https?:\/\/(?:www\.|m\.)?pinterest\.com\/pin\/.+/i,
  ],
  snapchat: [
    /^https?:\/\/(?:www\.|m\.|story\.)?snapchat\.com\/.+/i,
  ],
};
```

### Detection Algorithm

1. Strip whitespace and trailing slashes from the input URL.
2. For each platform, test the URL against all patterns in order.
3. Return the first platform with a matching pattern (confidence = 1.0).
4. If no pattern matches, return `{ platform: "unknown", confidence: 0 }`.
5. The download service will then throw `UNSUPPORTED_PLATFORM` for unknown platforms.

---

## 7. Structured Logging Interface

### DownloadLogEntry

```typescript
interface DownloadLogEntry {
  /** Unique request identifier (UUID) */
  requestId: string;

  /** Timestamp of the request */
  timestamp: Date;

  /** Platform identifier */
  platform: string;

  /** Provider that handled the request */
  provider: string;

  /** Original URL submitted by the user */
  url: string;

  /** Request outcome */
  status: "success" | "error";

  /** Total execution time in milliseconds */
  executionTime: number;

  /** Error code (if status is "error") */
  error?: NovaDLErrorCode;

  /** Original error message (if status is "error") */
  errorMessage?: string;

  /** User IP address (for rate limiting and analytics) */
  ipAddress?: string;
}
```

### DownloadLogger

```typescript
class DownloadLogger {
  /**
   * Log a download request to both the database and console.
   * Database: writes to DownloadLog Prisma model.
   * Console: outputs structured JSON log for debugging.
   */
  log(entry: DownloadLogEntry): Promise<void>;

  /**
   * Query recent logs (for analytics and admin dashboard).
   */
  getRecentLogs(limit: number): Promise<DownloadLogEntry[]>;

  /**
   * Get aggregated statistics for a time range.
   */
  getStats(from: Date, to: Date): Promise<DownloadStats>;
}

interface DownloadStats {
  totalDownloads: number;
  successCount: number;
  failCount: number;
  avgResponseMs: number;
  byPlatform: Record<string, { total: number; success: number; fail: number }>;
  byProvider: Record<string, { total: number; success: number; avgResponseMs: number }>;
}
```

---

## 8. Adapter Implementation Template

Every new provider adapter should follow this template:

```typescript
// src/services/providers/adapters/<platform>/<provider-name>.ts

import { NovaDLProvider, ProviderHealth } from '../types';
import { NovaDLResult, NovaDLFormat, NovaDLAudio, NovaDLImage, NovaDLMetadata } from '../../types';
import { NovaDLError, NovaDLErrorCode } from '../../errors';

export class <Platform><ProviderName>Adapter implements NovaDLProvider {
  name = "<provider-name>";
  platform = "<platform>";

  async fetchVideo(url: string): Promise<NovaDLResult> {
    try {
      // 1. Call the external API
      const response = await fetch(/* API URL */, {
        headers: { /* auth headers */ },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        // Map HTTP status codes to NovaDLErrorCode
        throw this.mapHttpError(response.status, url);
      }

      const raw = await response.json();

      // 2. Parse the platform-specific response
      const parsed = this.parseResponse(raw);

      // 3. Translate into NovaDLResult
      return this.toNovaDLResult(parsed);

    } catch (error) {
      if (error instanceof NovaDLError) throw error;
      throw new NovaDLError(
        NovaDLErrorCode.DOWNLOAD_FAILED,
        error instanceof Error ? error.message : 'Unknown error',
        this.platform,
        generateRequestId(),
        { provider: this.name, originalError: error instanceof Error ? error : undefined }
      );
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    // Make a lightweight API call and measure latency
    const start = Date.now();
    try {
      const response = await fetch(/* health endpoint */, {
        headers: { /* auth headers */ },
        signal: AbortSignal.timeout(10000),
      });
      const latency = Date.now() - start;
      return {
        status: response.ok ? "online" : "degraded",
        latency,
        availability: response.ok ? 1.0 : 0.0,
        lastCheck: new Date(),
      };
    } catch {
      return {
        status: "offline",
        latency: Date.now() - start,
        availability: 0.0,
        lastCheck: new Date(),
      };
    }
  }

  supportedFormats(): string[] {
    return [/* list of NovaDLFormatType values this provider can return */];
  }

  private mapHttpError(status: number, url: string): NovaDLError {
    // Map platform-specific HTTP errors to NovaDLErrorCode
    switch (status) {
      case 403: return new NovaDLError(NovaDLErrorCode.PRIVATE_CONTENT, ...);
      case 404: return new NovaDLError(NovaDLErrorCode.DELETED_CONTENT, ...);
      case 429: return new NovaDLError(NovaDLErrorCode.RATE_LIMITED, ...);
      default:  return new NovaDLError(NovaDLErrorCode.DOWNLOAD_FAILED, ...);
    }
  }

  private parseResponse(raw: any): any {
    // Extract relevant fields from the provider's raw response
    // Platform-specific parsing logic goes here
  }

  private toNovaDLResult(parsed: any): NovaDLResult {
    // Translate parsed platform-specific data into NovaDLResult
    // Must fill: success, message, platform, title, author, thumbnail, formats[], audio[], images[], metadata
  }
}
```

---

## 9. Testing Requirements

Before any provider adapter is registered in the production registry, it must pass these tests:

1. **Happy path**: Given a valid URL for its platform, `fetchVideo()` returns a `NovaDLResult` with `success: true`, at least one `format` entry, and correct platform/title/author fields.

2. **Error path**: Given an invalid URL, a private/deleted URL, or a rate-limited scenario, `fetchVideo()` throws a `NovaDLError` with the correct `NovaDLErrorCode`.

3. **Health check**: `healthCheck()` returns within 10 seconds with a valid `ProviderHealth` object.

4. **Format coverage**: `supportedFormats()` returns at least one format type that the provider actually delivers in `fetchVideo()` results.

5. **Null safety**: `fetchVideo()` handles missing/null fields in the provider API response gracefully — missing optional fields become `undefined`, not crashes.

6. **Timeout handling**: If the external API doesn't respond within 15 seconds, `fetchVideo()` throws `DOWNLOAD_FAILED` rather than hanging indefinitely.

---

## 10. Versioning

The NovaDL provider interface follows semantic versioning:

- **v1.0.0** (Phase 1): `NovaDLProvider` with `fetchVideo()`, `healthCheck()`, `supportedFormats()`. TikTok-only implementation.
- **v1.1.0** (Phase 2): Add Instagram provider adapter. No interface changes.
- **v1.2.0** (Phase 3): Add YouTube provider adapter. May add `VIDEO_4K` format type.
- **v2.0.0** (Future): Breaking changes if needed (e.g., batch download, playlist support).

Providers must declare which interface version they implement. The registry will reject providers that implement incompatible versions.
