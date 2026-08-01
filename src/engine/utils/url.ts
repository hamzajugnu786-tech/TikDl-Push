/**
 * NovaDL Engine — URL Detection Utilities
 * 
 * Determines the platform from a URL string. This is the first
 * step in the extraction pipeline — before providers can be
 * selected, we need to know what platform we're dealing with.
 * 
 * Uses pattern matching against known domain structures,
 * with fallback heuristics for unknown platforms.
 */

import type { Platform } from '../types/index';
import { PLATFORM_DETECTORS } from '../types/index';

/**
 * Detect the platform from a URL string.
 * 
 * Walks through the known domain-to-platform mapping,
 * checking if the URL's hostname matches any known platform domain.
 * Returns 'unknown' if no match is found.
 */
export function detectPlatform(url: string): Platform {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Special case: YouTube Shorts URLs use the same domain as YouTube
    // but with /shorts/ in the path — must be checked before domain matching
    // to avoid returning 'youtube' instead of 'youtube_shorts'
    if (hostname.includes('youtube.com') && parsed.pathname.startsWith('/shorts/')) {
      return 'youtube_shorts';
    }

    // Check exact domain matches
    for (const [domain, platform] of Object.entries(PLATFORM_DETECTORS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return platform;
      }
    }

    // Fallback: pattern-based detection
    return detectPlatformByPattern(hostname, parsed.pathname);
  } catch {
    // Invalid URL — return unknown
    return 'unknown';
  }
}

/**
 * Pattern-based platform detection for URLs that don't match
 * known domains exactly. Useful for redirect URLs, shortened
 * links, and custom domain patterns.
 */
function detectPlatformByPattern(hostname: string, pathname: string): Platform {
  // TikTok patterns (vm.tiktok.com, shortened links)
  if (hostname.includes('tiktok')) return 'tiktok';

  // Instagram patterns
  if (hostname.includes('instagram')) return 'instagram';

  // YouTube patterns (embed URLs, invidious instances)
  if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
    if (pathname.startsWith('/shorts/')) return 'youtube_shorts';
    return 'youtube';
  }

  // Twitter/X patterns
  if (hostname.includes('twitter') || hostname.includes('x.com') || hostname.includes('t.co')) {
    return 'x_twitter';
  }

  // Facebook patterns
  if (hostname.includes('facebook') || hostname.includes('fb.')) return 'facebook';

  // Pinterest
  if (hostname.includes('pinterest')) return 'pinterest';

  // Threads
  if (hostname.includes('threads')) return 'threads';

  // Snapchat
  if (hostname.includes('snapchat')) return 'snapchat_spotlight';

  // Reddit
  if (hostname.includes('reddit')) return 'reddit';

  // LinkedIn
  if (hostname.includes('linkedin')) return 'linkedin';

  // Vimeo
  if (hostname.includes('vimeo')) return 'vimeo';

  // Dailymotion
  if (hostname.includes('dailymotion')) return 'dailymotion';

  // Bilibili
  if (hostname.includes('bilibili') || hostname.includes('b23')) return 'bilibili';

  // SoundCloud
  if (hostname.includes('soundcloud')) return 'soundcloud';

  // MixCloud
  if (hostname.includes('mixcloud')) return 'mixcloud';

  // Spotify
  if (hostname.includes('spotify')) return 'spotify';

  // Likee
  if (hostname.includes('likee')) return 'likee';

  // CapCut
  if (hostname.includes('capcut')) return 'capcut';

  // Lemon8 (ByteDance lifestyle/community app)
  if (hostname.includes('lemon8')) return 'lemon8';

  // Tumblr
  if (hostname.includes('tumblr')) return 'tumblr';

  // Streamable
  if (hostname.includes('streamable')) return 'streamable';

  // VK (VKontakte — Russian social network)
  if (hostname.includes('vk')) return 'vk';

  return 'unknown';
}

/**
 * Validate a URL string for extraction.
 * 
 * Checks that the URL:
 * - Is a valid URL string
 * - Uses http or https protocol
 * - Has a hostname
 * - Doesn't exceed max length
 * - Doesn't appear to be a private/internal network address
 */
export interface UrlValidationResult {
  valid: boolean;
  url: string;
  normalizedUrl: string;
  platform: Platform;
  errors: string[];
}

export function validateAndDetectUrl(
  rawUrl: string,
  maxLength: number = 2048,
): UrlValidationResult {
  const errors: string[] = [];

  // Trim whitespace
  const url = rawUrl.trim();

  // Length check
  if (url.length > maxLength) {
    errors.push(`URL exceeds maximum length of ${maxLength} characters`);
  }

  // Basic format check
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // Try adding https prefix for common patterns
    const withHttps = `https://${url}`;
    try {
      new URL(withHttps);
      return validateAndDetectUrl(withHttps, maxLength);
    } catch {
      errors.push('URL must start with http:// or https://');
    }
  }

  // Parse URL
  let normalizedUrl = url;
  try {
    const parsed = new URL(url);
    normalizedUrl = parsed.toString();

    // Protocol check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      errors.push(`Invalid protocol: ${parsed.protocol}. Only http and https are supported.`);
    }

    // Hostname check
    if (!parsed.hostname) {
      errors.push('URL must have a valid hostname');
    }

    // Private IP check (basic)
    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname === '0.0.0.0'
    ) {
      errors.push('Private/internal network URLs are not supported');
    }
  } catch {
    errors.push('Invalid URL format');
  }

  const platform = errors.length === 0 ? detectPlatform(normalizedUrl) : 'unknown';

  return {
    valid: errors.length === 0,
    url: rawUrl,
    normalizedUrl,
    platform,
    errors,
  };
}

/**
 * Get the list of all supported platforms.
 */
export function getSupportedPlatforms(): Platform[] {
  const platforms = new Set<Platform>(Object.values(PLATFORM_DETECTORS));
  platforms.add('youtube_shorts');
  return [...platforms].sort();
}

/**
 * Check if a platform is supported by the engine.
 */
export function isPlatformSupported(platform: string): boolean {
  return getSupportedPlatforms().includes(platform as Platform);
}
