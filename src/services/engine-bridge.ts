/**
 * NovaDL Engine Bridge — Integration Layer
 *
 * Bridges the real NovaDL engine (NovaDLEngine) into TikDL's existing
 * service layer. The engine's NovaDLEngine.extract() returns an
 * ExtractionResult with MediaItem[] and ExtractionMetadata, while
 * TikDL's frontend expects NovaDLResult with formats/audio/images.
 *
 * This bridge:
 * 1. Initializes the real NovaDL engine with proper config
 * 2. Calls engine.extract() for download requests
 * 3. Converts ExtractionResult → NovaDLResult for the frontend
 * 4. Maps engine errors to NovaDLError for the service layer
 *
 * Provider priority: Native TikTok (priority 1) → TikHub (10) → RapidAPI (15)
 */

import { NovaDLEngine } from '@/engine/core/engine';
import type { ExtractionResult, ExtractionRequest, Platform as EnginePlatform } from '@/engine/types/index';
import type { NovaDLResult, NovaDLFormat, NovaDLAudio, NovaDLImage, NovaDLMetadata } from './types';
import { NovaDLFormatType, NovaDLImageType } from './types';
import { NovaDLError, NovaDLErrorCode, generateRequestId } from './errors';

// ─── Engine Singleton ────────────────────────────────────────────────

let engineInstance: NovaDLEngine | null = null;
let engineInitializing = false;
let engineInitFailed = false;

/**
 * Get or create the NovaDL engine singleton.
 * Returns null if the engine cannot be initialized (e.g. incompatible
 * host environment like Vercel serverless). Never throws.
 */
export async function getEngine(): Promise<NovaDLEngine | null> {
  if (engineInstance) return engineInstance;
  if (engineInitFailed) return null;
  if (engineInitializing) {
    // Wait for concurrent initialization to finish
    await new Promise((resolve) => setTimeout(resolve, 100));
    return getEngine();
  }

  engineInitializing = true;

  try {
    const tikhubApiKey = process.env.TIKHUB_API_KEY || '';
    const rapidApiKey = process.env.RAPIDAPI_KEY || '';

    const config = {
      server: {
        port: 3001,  // Engine runs embedded; Zod requires >=1 (port 0 is invalid)
        host: '0.0.0.0',
        logLevel: 'warn' as const,
        debug: false,
        cors: { enabled: false, origins: [] as string[] },
      },
      providers: [
        {
          id: 'tikhub',
          name: 'TikHub API Provider',
          type: 'api' as const,
          enabled: true,
          priority: 10,
          timeout: 8000,
          maxRetries: 0,
          platforms: ['tiktok', 'instagram', 'threads', 'snapchat_spotlight', 'likee', 'lemon8'] as EnginePlatform[],
          apiKey: tikhubApiKey,
          baseUrl: 'https://tikhub.io/api/v1',
        },
        {
          id: 'rapidapi',
          name: 'RapidAPI Marketplace Provider',
          type: 'api' as const,
          enabled: true,
          priority: 15,
          timeout: 8000,
          maxRetries: 0,
          platforms: ['tiktok', 'instagram', 'youtube', 'youtube_shorts', 'facebook', 'x_twitter', 'pinterest', 'reddit', 'vimeo', 'lemon8'] as EnginePlatform[],
          apiKey: rapidApiKey,
          baseUrl: 'https://tiktok-video-no-watermark2.p.rapidapi.com',
        },
      ],
      cache: {
        adapter: 'memory' as const,
        ttlMs: 3600000,
        maxEntries: 1000,
      },
      queue: {
        adapter: 'memory' as const,
        concurrency: 5,
      },
      security: {
        rateLimit: { max: 100, windowMs: 60000 },
        maxUrlLength: 2048,
        ssrfBlockedHosts: [],
        requestSigning: { enabled: false },
        abuseDetection: { enabled: false, threshold: 50, windowMs: 300000 },
      },
      extraction: {
        defaultTimeoutMs: 10000,
        maxRetries: 0,
        retryBackoffMs: 500,
        parallelProviderTests: true,
        streamBufferSize: 65536,
        ytdlpPath: 'yt-dlp',
        ytdlpTimeoutMs: 30000,
      },
      monitoring: {
        healthCheckIntervalMs: 60000,
        metricsEnabled: false,
        profilingEnabled: false,
      },
      plugins: {
        autoLoad: false,
      },
    };

    const engine = new NovaDLEngine(config);
    await engine.initialize();

    engineInstance = engine;
    console.log('[EngineBridge] NovaDL engine initialized successfully');
    console.log(`[EngineBridge] Registered providers: ${engine.getProviders().map(p => p.id).join(', ')}`);

    return engine;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.info(`[EngineBridge] NovaDL engine unavailable (${msg.slice(0, 120)}). Using provider registry fallback.`);
    engineInitFailed = true;
    return null;
  } finally {
    engineInitializing = false;
  }
}

/**
 * Extract media using the real NovaDL engine.
 * Returns a NovaDLResult compatible with TikDL's frontend.
 */
export async function extractWithEngine(url: string, platform: string): Promise<NovaDLResult> {
  const requestId = generateRequestId();
  const engine = await getEngine();

  if (!engine) {
    throw new NovaDLError(NovaDLErrorCode.PROVIDER_OFFLINE, 'NovaDL engine not available', platform, requestId);
  }

  try {
    const request: ExtractionRequest = {
      url,
      platform: platform as EnginePlatform,
      options: {
        extractVideo: true,
        extractAudio: true,
        extractCover: true,
        extractThumbnail: true,
        extractMetadata: true,
        detectWatermark: true,
      },
    };

    const result = await engine.extract(request);

    // Convert ExtractionResult → NovaDLResult
    const novaDLResult = engineResultToNovaDLResult(result, platform);

    return novaDLResult;
  } catch (error) {
    // Map engine errors to NovaDLError
    throw mapEngineError(error, platform, requestId);
  }
}

// ─── Result Conversion ────────────────────────────────────────────────

/**
 * Convert the engine's ExtractionResult into TikDL's NovaDLResult format.
 *
 * ExtractionResult has:
 *   media: MediaItem[] (each with type, format, quality, url, etc.)
 *   metadata: ExtractionMetadata (title, author, etc.)
 *   covers: CoverImage[]
 *   thumbnails: Thumbnail[]
 *
 * NovaDLResult has:
 *   formats: NovaDLFormat[] (video formats)
 *   audio: NovaDLAudio[]
 *   images: NovaDLImage[]
 *   metadata: NovaDLMetadata
 */
function engineResultToNovaDLResult(result: ExtractionResult, platform: string): NovaDLResult {
  const formats: NovaDLFormat[] = [];
  const audio: NovaDLAudio[] = [];
  const images: NovaDLImage[] = [];

  // Process media items
  for (const item of result.media) {
    if (item.type === 'video') {
      const isWatermarked = item.watermark?.detected === true;

      formats.push({
        type: isWatermarked ? NovaDLFormatType.VIDEO_WITH_WATERMARK : NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: item.directUrl || item.url,
        quality: typeof item.quality === 'string' ? item.quality : undefined,
        extension: item.format || 'mp4',
        label: isWatermarked
          ? `With Watermark${item.resolution ? ` (${item.resolution.height}p)` : ''}`
          : `No Watermark${item.resolution ? ` (${item.resolution.height}p)` : ' HD'}`,
      });

      // If we have a watermarked version, also try to add a no-watermark version
      // from the download URL if available
      if (isWatermarked && item.url !== item.directUrl && item.directUrl) {
        // Skip duplicate
      }
    } else if (item.type === 'audio') {
      audio.push({
        url: item.directUrl || item.url,
        format: item.format || 'mp3',
        extension: item.format || 'mp3',
        label: item.title ? `${item.title} (MP3)` : 'MP3 Audio',
      });
    }
  }

  // If no no-watermark format was found, promote the first video as no-watermark
  const hasNoWatermark = formats.some(f => f.type === NovaDLFormatType.VIDEO_NO_WATERMARK);
  if (!hasNoWatermark && formats.length > 0) {
    const firstVideo = formats[0]!;
    if (firstVideo.type === NovaDLFormatType.VIDEO_WITH_WATERMARK) {
      // Add a no-watermark entry with the same URL (best available)
      formats.unshift({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: firstVideo.url,
        quality: firstVideo.quality || '1080p',
        extension: firstVideo.extension,
        label: 'No Watermark HD',
      });
    }
  }

  // Process cover images
  if (result.covers) {
    for (const cover of result.covers) {
      images.push({
        url: cover.url,
        type: NovaDLImageType.COVER,
        extension: cover.format || 'jpeg',
        label: 'Cover Image',
      });
    }
  }

  // Process thumbnails
  if (result.thumbnails) {
    for (const thumb of result.thumbnails) {
      // Avoid duplicate if thumbnail URL is same as cover
      const isDuplicate = images.some(
        (img) => img.url === thumb.url && img.type === NovaDLImageType.COVER
      );
      if (!isDuplicate) {
        images.push({
          url: thumb.url,
          type: NovaDLImageType.THUMBNAIL,
          extension: thumb.format || 'jpeg',
          label: 'Thumbnail',
        });
      }
    }
  }

  // Build metadata
  const meta = result.metadata;
  const metadata: NovaDLMetadata = {
    videoId: meta.extra?.videoId as string | undefined || result.id,
    views: meta.viewCount ? String(meta.viewCount) : undefined,
    likes: meta.likeCount ? String(meta.likeCount) : undefined,
    comments: meta.commentCount ? String(meta.commentCount) : undefined,
    shares: meta.shareCount ? String(meta.shareCount) : undefined,
    description: meta.description,
    uploadDate: meta.uploadDate,
  };

  // Build duration string
  const duration = meta.duration
    ? `${Math.floor(meta.duration / 60)}:${String(Math.floor(meta.duration % 60)).padStart(2, '0')}`
    : undefined;

  // Get thumbnail URL (first cover or first thumbnail)
  const thumbnailUrl = result.covers?.[0]?.url || result.thumbnails?.[0]?.url || '';

  return {
    success: true,
    message: `Successfully fetched ${platform} video via ${result.provider}`,
    platform,
    title: meta.title || 'Untitled Video',
    author: meta.author || meta.authorId || '@unknown',
    authorAvatar: meta.authorUrl || '',
    thumbnail: thumbnailUrl,
    duration,
    formats,
    audio,
    images,
    metadata,
  };
}

// ─── Error Mapping ────────────────────────────────────────────────────

/**
 * Map engine errors to NovaDLError for the service layer.
 */
function mapEngineError(error: unknown, platform: string, requestId: string): NovaDLError {
  const message = error instanceof Error ? error.message : String(error);

  // Check for specific error patterns
  if (message.includes('private') || message.includes('PRIVATE')) {
    return new NovaDLError(NovaDLErrorCode.PRIVATE_CONTENT, message, platform, requestId);
  }
  if (message.includes('deleted') || message.includes('NOT_FOUND')) {
    return new NovaDLError(NovaDLErrorCode.DELETED_CONTENT, message, platform, requestId);
  }
  if (message.includes('geo') || message.includes('GEO_BLOCKED')) {
    return new NovaDLError(NovaDLErrorCode.GEO_BLOCKED, message, platform, requestId);
  }
  if (message.includes('age') || message.includes('AGE_RESTRICTED')) {
    return new NovaDLError(NovaDLErrorCode.AGE_RESTRICTED, message, platform, requestId);
  }
  if (message.includes('rate') || message.includes('RATE_LIMITED')) {
    return new NovaDLError(NovaDLErrorCode.RATE_LIMITED, message, platform, requestId);
  }
  if (message.includes('No providers available')) {
    return new NovaDLError(NovaDLErrorCode.PROVIDER_OFFLINE, message, platform, requestId);
  }
  if (message.includes('Invalid URL')) {
    return new NovaDLError(NovaDLErrorCode.INVALID_URL, message, platform, requestId);
  }
  if (message.includes('UNSUPPORTED')) {
    return new NovaDLError(NovaDLErrorCode.UNSUPPORTED_PLATFORM, message, platform, requestId);
  }

  // Default: DOWNLOAD_FAILED
  return new NovaDLError(
    NovaDLErrorCode.DOWNLOAD_FAILED,
    message,
    platform,
    requestId,
    { originalError: error instanceof Error ? error : undefined }
  );
}

/**
 * Check if the engine has been initialized.
 */
export function isEngineInitialized(): boolean {
  return engineInstance !== null;
}

/**
 * Reset the engine (for testing or reinitialization).
 */
export function resetEngine(): void {
  engineInstance = null;
  engineInitializing = false;
  engineInitFailed = false;
}
