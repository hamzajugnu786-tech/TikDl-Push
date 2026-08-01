/**
 * NovaDL Engine — Input Validation Module
 *
 * Validates URLs, extraction requests, platform strings, and media formats.
 * Provides sanitization and detailed error reporting to prevent injection
 * attacks and malformed data from reaching downstream providers.
 */

import type {
  ExtractionRequest,
  Platform,
  MediaFormat,
  VideoFormat,
  AudioFormat,
  ImageFormat,
  SubtitleFormat,
} from '../types/index';

// ─── Validation Result ──────────────────────────────────────────────

/**
 * Result of a validation operation. Carries either sanitized values
 * on success or descriptive error messages on failure.
 */
export interface ValidationResult {
  /** Whether the input passed all validation checks */
  valid: boolean;
  /** Sanitized / normalized value when valid */
  sanitized?: string;
  /** Human-readable error messages when invalid */
  errors: string[];
  /** Additional warnings that don't block validation */
  warnings: string[];
}

// ─── Known Values ───────────────────────────────────────────────────

const VALID_PLATFORMS: Set<string> = new Set([
  'tiktok',
  'instagram',
  'facebook',
  'youtube',
  'youtube_shorts',
  'x_twitter',
  'pinterest',
  'threads',
  'snapchat_spotlight',
  'reddit',
  'linkedin',
  'vimeo',
  'dailymotion',
  'likee',
  'bilibili',
  'capcut',
  'soundcloud',
  'spotify',
  'unknown',
]);

const VALID_VIDEO_FORMATS: Set<string> = new Set(['mp4', 'webm', 'avi', 'mov', 'flv']);
const VALID_AUDIO_FORMATS: Set<string> = new Set(['mp3', 'aac', 'opus', 'flac', 'wav', 'm4a', 'ogg']);
const VALID_IMAGE_FORMATS: Set<string> = new Set(['png', 'jpeg', 'webp', 'gif']);
const VALID_SUBTITLE_FORMATS: Set<string> = new Set(['srt', 'vtt', 'ass', 'lrc']);

/** Maximum URL length (default; overridden by SecurityConfig.maxUrlLength) */
const DEFAULT_MAX_URL_LENGTH = 2048;

/** Allowed URL schemes — only http/https are permitted */
const ALLOWED_SCHEMES = ['http:', 'https:'];

/** Regex for dangerous URL-encoded control characters */
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

/** Regex for path traversal sequences */
const PATH_TRAVERSAL_PATTERN = /\.\.[\\/]/;

/** Regex for protocol-relative URLs that bypass scheme checks */
const PROTOCOL_RELATIVE_PATTERN = /^\/\//;

/** Regex for javascript/data/vbscript scheme indicators */
const DANGEROUS_SCHEME_PATTERN = /^(javascript|data|vbscript|file):/i;

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Creates a successful ValidationResult with a sanitized value.
 */
function ok(sanitized: string, warnings: string[] = []): ValidationResult {
  return { valid: true, sanitized, errors: [], warnings };
}

/**
 * Creates a failed ValidationResult with error messages.
 */
function fail(errors: string[], warnings: string[] = []): ValidationResult {
  return { valid: false, sanitized: undefined, errors, warnings };
}

// ─── URL Validation ──────────────────────────────────────────────────

/**
 * Validates that a URL is safe, properly formatted, within length limits,
 * and does not target internal/SSRF-vulnerable destinations.
 *
 * Checks performed:
 *  1. Non-empty and within max length
 *  2. No dangerous schemes (javascript:, data:, vbscript:, file:)
 *  3. No protocol-relative URLs
 *  4. No control characters or path-traversal sequences
 *  5. Parses successfully as a valid http/https URL
 *  6. Hostname is present and not an IP that looks private
 *  7. No userinfo (embedded credentials) in the URL
 *
 * @param url       - The raw URL string to validate
 * @param maxLength - Maximum allowed URL length (defaults to 2048)
 * @returns ValidationResult with sanitized URL on success or errors on failure
 */
export function validateUrl(url: string, maxLength: number = DEFAULT_MAX_URL_LENGTH): ValidationResult {
  const warnings: string[] = [];

  // 1. Non-empty
  if (!url || typeof url !== 'string') {
    return fail(['URL must be a non-empty string']);
  }

  const trimmed = url.trim();

  if (trimmed.length === 0) {
    return fail(['URL must not be empty or whitespace-only']);
  }

  // 2. Length check
  if (trimmed.length > maxLength) {
    return fail([`URL exceeds maximum length of ${maxLength} characters (got ${trimmed.length})`]);
  }

  // 3. Dangerous schemes
  if (DANGEROUS_SCHEME_PATTERN.test(trimmed)) {
    return fail(['URL uses a forbidden scheme (javascript, data, vbscript, or file)']);
  }

  // 4. Protocol-relative URL
  if (PROTOCOL_RELATIVE_PATTERN.test(trimmed)) {
    return fail(['Protocol-relative URLs are not allowed']);
  }

  // 5. Control characters
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    return fail(['URL contains control characters']);
  }

  // 6. Path traversal
  if (PATH_TRAVERSAL_PATTERN.test(trimmed)) {
    return fail(['URL contains path-traversal sequences (..)']);
  }

  // 7. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return fail(['URL is not a valid URI']);
  }

  // 8. Scheme whitelist
  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return fail([`URL scheme '${parsed.protocol}' is not allowed (only http: and https:)`]);
  }

  // 9. Hostname must be present
  if (!parsed.hostname || parsed.hostname.length === 0) {
    return fail(['URL must have a hostname']);
  }

  // 10. No embedded credentials
  if (parsed.username || parsed.password) {
    warnings.push('URL contains userinfo (embedded credentials) — these will be stripped');
    parsed.username = '';
    parsed.password = '';
  }

  // 11. No port that looks suspicious (port 0)
  if (parsed.port === '0') {
    return fail(['URL targets port 0, which is invalid']);
  }

  // Sanitize: reconstruct the URL without credentials
  const sanitized = parsed.toString();

  // 12. Basic private-IP heuristic in hostname (full SSRF check is in ssrf.ts)
  if (/^(127\.\d|10\.\d|0\.\d|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname)) {
    return fail(['URL hostname appears to be a private/internal IP address']);
  }

  return ok(sanitized, warnings);
}

// ─── Extraction Request Validation ───────────────────────────────────

/**
 * Validates a full extraction request, including its URL, platform,
 * format, quality, and provider fields.
 *
 * @param req      - The extraction request to validate
 * @param config   - Optional security config for max URL length
 * @returns ValidationResult with sanitized request details or errors
 */
export function validateExtractionRequest(
  req: ExtractionRequest,
  config?: { maxUrlLength?: number },
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxUrlLength = config?.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH;

  // URL is mandatory
  if (!req.url) {
    errors.push('ExtractionRequest.url is required');
    return fail(errors);
  }

  const urlResult = validateUrl(req.url, maxUrlLength);
  if (!urlResult.valid) {
    errors.push(...urlResult.errors);
  }
  if (urlResult.warnings.length > 0) {
    warnings.push(...urlResult.warnings);
  }

  // Platform validation (optional, but if provided must be valid)
  if (req.platform !== undefined && req.platform !== null) {
    const platformResult = validatePlatform(req.platform);
    if (platformResult === null) {
      errors.push(`Invalid platform: '${req.platform}'`);
    }
  }

  // Format validation (optional)
  if (req.preferredFormat !== undefined && req.preferredFormat !== null) {
    const formatResult = validateFormat(req.preferredFormat);
    if (formatResult === null) {
      errors.push(`Invalid media format: '${req.preferredFormat}'`);
    }
  }

  // Quality validation (optional — just check it's a non-empty string)
  if (req.preferredQuality !== undefined && req.preferredQuality !== null) {
    if (typeof req.preferredQuality !== 'string' || req.preferredQuality.trim().length === 0) {
      errors.push('preferredQuality must be a non-empty string');
    }
  }

  // Provider validation (optional — just check it's a non-empty string)
  if (req.preferredProvider !== undefined && req.preferredProvider !== null) {
    if (typeof req.preferredProvider !== 'string' || req.preferredProvider.trim().length === 0) {
      errors.push('preferredProvider must be a non-empty string');
    }
  }

  // Options validation (optional)
  if (req.options) {
    const opts = req.options;

    if (opts.timeout !== undefined) {
      if (typeof opts.timeout !== 'number' || opts.timeout <= 0 || opts.timeout > 300_000) {
        errors.push('options.timeout must be a positive number ≤ 300000 ms');
      }
    }

    if (opts.maxRetries !== undefined) {
      if (typeof opts.maxRetries !== 'number' || opts.maxRetries < 0 || opts.maxRetries > 10) {
        errors.push('options.maxRetries must be a number between 0 and 10');
      }
    }

    if (opts.formats !== undefined) {
      for (const fmt of opts.formats) {
        if (validateFormat(fmt) === null) {
          errors.push(`Invalid format in options.formats: '${fmt}'`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return fail(errors, warnings);
  }

  const sanitized = urlResult.sanitized ?? req.url;
  return ok(sanitized, warnings);
}

// ─── Platform Validation ─────────────────────────────────────────────

/**
 * Validates that a platform string is a recognized Platform value.
 *
 * @param platform - The platform string to validate
 * @returns The validated Platform value, or null if unrecognized
 */
export function validatePlatform(platform: string): Platform | null {
  if (typeof platform !== 'string') {
    return null;
  }

  const normalized = platform.trim().toLowerCase();

  if (VALID_PLATFORMS.has(normalized)) {
    return normalized as Platform;
  }

  return null;
}

// ─── Format Validation ───────────────────────────────────────────────

/**
 * Validates that a format string is a recognized MediaFormat value.
 * Returns the typed format or null if unrecognized.
 *
 * @param format - The format string to validate
 * @returns The validated MediaFormat, or null if unrecognized
 */
export function validateFormat(format: string): MediaFormat | null {
  if (typeof format !== 'string') {
    return null;
  }

  const normalized = format.trim().toLowerCase();

  if (VALID_VIDEO_FORMATS.has(normalized)) {
    return normalized as VideoFormat;
  }

  if (VALID_AUDIO_FORMATS.has(normalized)) {
    return normalized as AudioFormat;
  }

  if (VALID_IMAGE_FORMATS.has(normalized)) {
    return normalized as ImageFormat;
  }

  if (VALID_SUBTITLE_FORMATS.has(normalized)) {
    return normalized as SubtitleFormat;
  }

  return null;
}

/**
 * Checks whether a format string belongs to a specific media category.
 *
 * @param format  - The format to categorize
 * @param kind    - The expected category: 'video', 'audio', 'image', or 'subtitle'
 * @returns true if the format matches the category
 */
export function isFormatKind(format: string, kind: 'video' | 'audio' | 'image' | 'subtitle'): boolean {
  const normalized = format.trim().toLowerCase();
  switch (kind) {
    case 'video':    return VALID_VIDEO_FORMATS.has(normalized);
    case 'audio':    return VALID_AUDIO_FORMATS.has(normalized);
    case 'image':    return VALID_IMAGE_FORMATS.has(normalized);
    case 'subtitle': return VALID_SUBTITLE_FORMATS.has(normalized);
    default:         return false;
  }
}
