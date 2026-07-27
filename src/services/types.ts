/**
 * NovaDL Unified Download Result Types — Phase 1 Core Interfaces
 *
 * These types define the universal download result format that EVERY
 * provider must return. No platform-specific response structures anywhere.
 *
 * ⚠️  These are TYPE DEFINITIONS ONLY — no runtime logic here.
 *     Actual implementations live in services/download.ts and adapters.
 */

// ============================================================================
// FORMAT TYPE ENUMS
// ============================================================================

/**
 * Standardised format type identifiers across all providers.
 * Each provider maps its platform-specific format names to these values.
 */
export enum NovaDLFormatType {
  // Video formats (universal)
  VIDEO_NO_WATERMARK = 'video_no_watermark',
  VIDEO_WITH_WATERMARK = 'video_with_watermark',
  VIDEO_HD = 'video_hd',
  VIDEO_SD = 'video_sd',
  VIDEO_LOW = 'video_low',
  VIDEO_ORIGINAL = 'video_original',

  // Instagram-specific (future)
  CAROUSEL_ITEM = 'carousel_item',
  REEL_VIDEO = 'reel_video',
  STORY_VIDEO = 'story_video',
  IGTV_VIDEO = 'igtv_video',

  // YouTube-specific (future)
  VIDEO_4K = 'video_4k',
  VIDEO_1080P = 'video_1080p',
  VIDEO_720P = 'video_720p',
  VIDEO_480P = 'video_480p',
  VIDEO_360P = 'video_360p',
  VIDEO_240P = 'video_240p',

  // Pinterest-specific (future)
  PIN_IMAGE = 'pin_image',
  PIN_VIDEO = 'pin_video',

  // Twitter/X-specific (future)
  GIF_VIDEO = 'gif_video',
}

/**
 * Standardised image type identifiers across all providers.
 */
export enum NovaDLImageType {
  COVER = 'cover',
  THUMBNAIL = 'thumbnail',
  AUTHOR_AVATAR = 'author_avatar',
  CAROUSEL_IMAGE = 'carousel_image',
  STORY_IMAGE = 'story_image',
  PIN_IMAGE = 'pin_image',
}

// ============================================================================
// CORE RESULT STRUCTURES
// ============================================================================

/**
 * The unified download result that EVERY provider must return.
 * This is the single source of truth for download data.
 */
export interface NovaDLResult {
  /** Whether the fetch was successful */
  success: boolean;

  /** Human-readable status message */
  message: string;

  /** Platform identifier (e.g. "tiktok", "instagram", "youtube") */
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

/**
 * A single video/media format available for download.
 */
export interface NovaDLFormat {
  /** Format type identifier — standardised NovaDLFormatType */
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

/**
 * A single audio format available for download.
 */
export interface NovaDLAudio {
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

/**
 * A single image available for download.
 */
export interface NovaDLImage {
  /** Direct download URL */
  url: string;

  /** Image type identifier */
  type: NovaDLImageType;

  /** File extension (e.g. "jpg", "png", "webp") */
  extension: string;

  /** Human-readable display label */
  label: string;
}

/**
 * Platform-specific metadata — extensible for any platform.
 * The index signature allows any platform to add custom fields.
 */
export interface NovaDLMetadata {
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

// ============================================================================
// SERVICE RESULT (wraps NovaDLResult with request metadata)
// ============================================================================

/**
 * The result returned by DownloadService to the API route.
 * Contains the NovaDLResult plus request-level metadata.
 */
export interface ServiceResult {
  /** Whether the download request was successful */
  success: boolean;

  /** The unified download result (if successful) */
  data?: NovaDLResult;

  /** The standardised error (if failed) */
  error?: NovaDLErrorInfo;

  /** Which provider handled this request */
  provider: string;

  /** Which platform this request was for */
  platform: string;

  /** Total execution time in milliseconds */
  duration: number;

  /** UUID request ID for log correlation */
  requestId: string;
}

/**
 * Lightweight error info for ServiceResult (not a full NovaDLError instance).
 * Used in JSON responses to the frontend.
 */
export interface NovaDLErrorInfo {
  /** Standardised error code */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Which platform this error relates to */
  platform: string;

  /** Which provider threw this error (if known) */
  provider?: string;

  /** Request ID for log correlation */
  requestId: string;
}
