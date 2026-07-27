/**
 * NovaDL Platform Detector — Phase 1
 *
 * Identifies which platform a URL belongs to by matching domain patterns.
 * Currently only TikTok is active, but the architecture is ready for
 * future platforms (Instagram, YouTube, Facebook, Twitter, Pinterest, Snapchat, etc.)
 *
 * ⚠️  In Phase 1, only TikTok URLs are accepted by the frontend validation.
 *     The PlatformDetector detects all supported platforms internally,
 *     but the frontend still rejects non-TikTok URLs.
 *     In Phase 2, the frontend validation expands to accept all detected platforms.
 */

export interface PlatformInfo {
  /** Platform identifier (e.g. "tiktok", "instagram", "youtube") */
  platform: string;

  /** The original URL as provided by the user */
  originalUrl: string;

  /** Normalized/canonical URL for provider consumption */
  canonicalUrl: string;

  /** Match confidence (0-1). 1 = exact match, lower = uncertain */
  confidence: number;
}

/**
 * URL patterns for each supported platform.
 * Order matters: more specific patterns should come first.
 */
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
  reddit: [
    /^https?:\/\/(?:www\.|old\.)?reddit\.com\/r\/.+\/comments\/.+/i,
  ],
  threads: [
    /^https?:\/\/(?:www\.|m\.)?threads\.net\/.+/i,
  ],
  vimeo: [
    /^https?:\/\/(?:www\.|player\.)?vimeo\.com\/.+/i,
  ],
  dailymotion: [
    /^https?:\/\/(?:www\.|m\.)?dailymotion\.com\/video\/.+/i,
  ],
};

/**
 * PlatformDetector — classifies URLs by platform.
 *
 * Usage:
 *   const info = PlatformDetector.identify(url);
 *   if (info.platform === 'tiktok') { ... }
 *
 * The detector is a singleton-like utility (static methods).
 * No need to instantiate — just call PlatformDetector.identify(url).
 */
export class PlatformDetector {
  /**
   * Identify which platform a URL belongs to.
   * Returns PlatformInfo with platform identifier, canonical URL, and confidence.
   *
   * Algorithm:
   * 1. Strip whitespace and trailing slashes from the input URL.
   * 2. For each platform, test the URL against all patterns in order.
   * 3. Return the first platform with a matching pattern (confidence = 1.0).
   * 4. If no pattern matches, return { platform: "unknown", confidence: 0 }.
   */
  static identify(url: string): PlatformInfo {
    // Strip whitespace and trailing slashes
    const trimmed = url.trim().replace(/\/+$/, '');

    for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(trimmed)) {
          return {
            platform,
            originalUrl: url,
            canonicalUrl: trimmed,
            confidence: 1.0,
          };
        }
      }
    }

    // No pattern matched — unknown platform
    return {
      platform: 'unknown',
      originalUrl: url,
      canonicalUrl: trimmed,
      confidence: 0,
    };
  }

  /**
   * Validate a URL against a specific platform's rules.
   * Returns true if the URL is a valid URL for the given platform.
   */
  static validateForPlatform(url: string, platform: string): boolean {
    const patterns = PLATFORM_PATTERNS[platform];
    if (!patterns) return false;

    const trimmed = url.trim().replace(/\/+$/, '');
    return patterns.some(pattern => pattern.test(trimmed));
  }

  /**
   * Get all supported platform identifiers (those with URL patterns defined).
   */
  static getSupportedPlatforms(): string[] {
    return Object.keys(PLATFORM_PATTERNS);
  }

  /**
   * Check if a platform is currently enabled in the provider registry.
   * In Phase 1, only "tiktok" is enabled.
   */
  static isPlatformEnabled(platform: string): boolean {
    // Phase 1: only TikTok is enabled
    const enabledPlatforms = ['tiktok'];
    return enabledPlatforms.includes(platform);
  }
}
