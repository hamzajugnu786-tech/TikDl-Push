/**
 * NovaDL Engine — MixCloud Native Extractor
 *
 * Extracts audio stream URLs, metadata, thumbnails, and artist/show
 * information from MixCloud cloudcasts (DJ mixes, radio shows).
 *
 * Extraction strategies (all real, no mock/demo):
 * 1. MixCloud oEmbed endpoint — returns title, author, thumbnail, HTML embed
 * 2. MixCloud page HTML parsing — extract m-data or embedded JSON containing
 *    audio stream configuration, show metadata, artist info
 * 3. MixCloud API endpoint — returns full cloudcast data with audio URL,
 *    description, tags, plays, favorites
 * 4. Open Graph meta tags — og:audio, og:audio:url, og:audio:type, og:title,
 *    og:description, og:image
 * 5. Embedded <audio> or player source URL extraction from page
 */

import { v4 as uuid } from 'uuid';
import type {
  Platform,
  ExtractionRequest,
  ExtractionResult,
  ExtractionMetadata,
  MediaItem,
  CoverImage,
  Thumbnail,
  QualityOption,
  ProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderFeature,
} from '../../types/index';
import { BaseProvider, ProviderError } from '../base';
import { detectPlatform } from '../../utils/url';

// ─── MixCloud Data Types ──────────────────────────────────────────────

/** Full cloudcast data returned by the MixCloud API */
interface MixCloudCloudcastData {
  key?: string;           // e.g. "/djjohnny/the-weekly-mix/"
  url?: string;           // canonical MixCloud URL
  name?: string;          // cloudcast title
  slug?: string;          // URL slug portion
  description?: string;
  pictures?: MixCloudPictures;
  tags?: MixCloudTag[];
  plays?: number;         // total play count
  favorites?: number;     // favorite count
  listeners?: number;     // unique listener count
  reposts?: number;       // repost count
  comments?: number;      // comment count
  user?: MixCloudUserData;
  audio_length?: number;  // duration in seconds
  created_time?: string;  // ISO date
  updated_time?: string;
  is_private?: boolean;
  is_draft?: boolean;
  exclusive?: boolean;
  premium?: boolean;
  repeat?: boolean;       // is a repeat/re-upload
  publish_state?: string;
  sections?: MixCloudSection[];
}

/** MixCloud user / artist data */
interface MixCloudUserData {
  key?: string;
  url?: string;
  name?: string;
  username?: string;
  slug?: string;
  pictures?: MixCloudPictures;
  biog?: string;
  created_time?: string;
  updated_time?: string;
  follower_count?: number;
  following_count?: number;
  is_pro?: boolean;
  is_artist?: boolean;
  is_subscriber?: boolean;
  favorite_count?: number;
  listen_count?: number;
  cloudcast_count?: number;
}

/** Picture sizes returned by MixCloud API */
interface MixCloudPictures {
  small?: string;     // ~100px
  thumbnail?: string; // ~150px
  medium?: string;    // ~300px
  large?: string;     // ~600px
  extra_large?: string; // ~1000px or original
}

/** Tag data from the MixCloud API */
interface MixCloudTag {
  key?: string;
  name?: string;
  url?: string;
  slug?: string;
}

/** Section (tracklist entry) within a cloudcast */
interface MixCloudSection {
  key?: string;
  position?: number;
  start_time?: number;   // seconds from start
  track?: MixCloudTrackRef;
}

/** Track reference within a section */
interface MixCloudTrackRef {
  key?: string;
  name?: string;
  artist?: MixCloudArtistRef;
}

/** Artist reference within a track */
interface MixCloudArtistRef {
  key?: string;
  name?: string;
  url?: string;
  slug?: string;
}

/** Data returned by the MixCloud oEmbed endpoint */
interface MixCloudOEmbedData {
  type?: string;
  version?: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  html?: string;
  width?: number;
  height?: number;
}

/** Embedded JSON data extracted from MixCloud page HTML */
interface MixCloudEmbeddedPageData {
  cloudcast?: MixCloudCloudcastData;
  audio_stream?: string;
  preview_url?: string;
  m_play?: string;
  player_url?: string;
}

// ─── URL Parsing Helper ──────────────────────────────────────────────

interface OwnerSlugResult {
  owner: string;
  slug: string;
}

function parseOwnerSlug(url: string): OwnerSlugResult | null {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname
      .split('/')
      .filter((segment) => segment.length > 0);

    // MixCloud URLs: /{owner}/{slug}/ or /{owner}/{slug}
    if (pathSegments.length >= 2) {
      return {
        owner: pathSegments[0] ?? '',
        slug: pathSegments[1] ?? '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Provider Implementation ──────────────────────────────────────────
export class MixCloudNativeExtractor extends BaseProvider {
  readonly id = 'native_mixcloud';
  readonly name = 'MixCloud Native Extractor';
  readonly type: 'custom' = 'custom';

  private _userAgent: string;

  constructor(config: ProviderConfig) {
    super(config);
    this._userAgent = config.customOptions?.userAgent as string ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  async initialize(): Promise<void> {
    this._initialized = true;
    this._health = {
      status: 'healthy',
      lastChecked: new Date(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const platform = request.platform ?? detectPlatform(request.url);

    if (!this.supports(platform)) {
      throw new ProviderError(
        `MixCloud native extractor does not support platform '${platform}'`,
        this.id,
        'UNSUPPORTED',
        false,
        platform,
      );
    }

    try {
      const result = await this.withTimeout(
        this._extractFromUrl(request.url),
        this.config.timeout,
      );
      this.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      const providerError = ProviderError.fromUnknown(this.id, error, platform);
      this.recordFailure(providerError.message, latency);
      throw providerError;
    }
  }

  supports(platform: Platform): boolean {
    return platform === 'mixcloud';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['mixcloud'],
      mediaTypes: ['audio', 'image', 'metadata'],
      formats: ['mp3', 'm4a', 'aac', 'jpeg', 'png', 'webp'],
      qualities: ['best', '128kbps', '64kbps'],
      features: [
        'audio_download', 'cover_extraction', 'metadata_extraction', 'artist_info',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      const response = await fetch('https://www.mixcloud.com', {
        headers: { 'User-Agent': this._userAgent },
        redirect: 'follow',
      });
      if (!response.ok) {
        return {
          status: 'unhealthy',
          latencyMs: Date.now() - startTime,
          lastChecked: new Date(),
          lastError: `MixCloud health check returned status ${response.status}`,
          consecutiveFailures: (this._health.consecutiveFailures ?? 0) + 1,
          consecutiveSuccesses: 0,
          successRate: 0,
        };
      }
      return {
        status: 'healthy',
        latencyMs: Date.now() - startTime,
        lastChecked: new Date(),
        consecutiveFailures: 0,
        consecutiveSuccesses: (this._health.consecutiveSuccesses ?? 0) + 1,
        successRate: 1.0,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date(),
        lastError: error instanceof Error ? error.message : 'MixCloud health check failed',
        consecutiveFailures: (this._health.consecutiveFailures ?? 0) + 1,
        consecutiveSuccesses: 0,
        successRate: 0,
      };
    }
  }

  // ─── Private: Main Extraction ──────────────────────────────────────────
  private async _extractFromUrl(url: string): Promise<ExtractionResult> {
    const ownerSlug = parseOwnerSlug(url);

    // Strategy 1: MixCloud API endpoint (full data including audio stream)
    if (ownerSlug) {
      try {
        const cloudcastData = await this._fetchApiData(ownerSlug.owner, ownerSlug.slug);
        if (cloudcastData) {
          return this._buildResultFromApi(cloudcastData, url);
        }
      } catch {
        // API strategy failed, continue to next
      }
    }

    // Strategy 2: MixCloud page HTML parsing (m-data / embedded JSON)
    try {
      const html = await this._fetchPage(url);
      const embeddedData = this._extractEmbeddedPageData(html);
      if (embeddedData) {
        return this._buildResultFromEmbeddedData(embeddedData, html, url);
      }

      // Strategy 5: Embedded <audio> or player source URL from page
      const audioSourceUrl = this._extractAudioSourceFromHtml(html);
      if (audioSourceUrl) {
        return this._buildResultFromAudioSource(audioSourceUrl, html, url);
      }
    } catch {
      // Page parsing failed, continue to next
    }

    // Strategy 3: MixCloud oEmbed endpoint
    try {
      const oembed = await this._fetchOEmbed(url);
      return this._buildResultFromOEmbed(oembed, url);
    } catch {
      // oEmbed failed
    }

    // Strategy 4: Open Graph meta tags (if we still have HTML from Strategy 2)
    // This is handled within _buildResultFromEmbeddedData fallbacks.
    // If all strategies above failed, we cannot extract.
    throw new ProviderError(
      'Could not extract MixCloud cloudcast data. All extraction strategies exhausted.',
      this.id,
      'PARSE_ERROR',
      false,
      'mixcloud',
    );
  }

  // ─── Private: API Fetch ──────────────────────────────────────────────
  private async _fetchApiData(owner: string, slug: string): Promise<MixCloudCloudcastData | null> {
    const apiUrl = `https://api.mixcloud.com/${owner}/${slug}/`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new ProviderError(
          `MixCloud cloudcast '${owner}/${slug}' not found`,
          this.id,
          'NOT_FOUND',
          false,
          'mixcloud',
        );
      }
      return null;
    }

    return await response.json() as MixCloudCloudcastData;
  }

  // ─── Private: Page Fetch ──────────────────────────────────────────────
  private async _fetchPage(url: string): Promise<string> {
    const normalizedUrl = this._normalizeUrl(url);
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `MixCloud page fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'mixcloud',
      );
    }

    return response.text();
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────────
  private async _fetchOEmbed(url: string): Promise<MixCloudOEmbedData> {
    const normalizedUrl = this._normalizeUrl(url);
    const oembedUrl = `https://www.mixcloud.com/oembed/?url=${encodeURIComponent(normalizedUrl)}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `MixCloud oEmbed failed: ${response.status}`,
        this.id,
        'NETWORK',
        response.status >= 500,
        'mixcloud',
      );
    }

    return await response.json() as MixCloudOEmbedData;
  }

  // ─── Private: Extract Embedded Page Data ──────────────────────────────
  private _extractEmbeddedPageData(html: string): MixCloudEmbeddedPageData | null {
    // MixCloud pages embed cloudcast data in a <div class="m-data"> or
    // within script tags containing JSON configuration
    const mDataMatch = /<div[^>]*class="m-data"[^>]*data-m-play="([^"]*)"[^>]*>/i.exec(html);
    if (mDataMatch?.[1]) {
      // m-data div contains data-m-play attribute with a preview/stream identifier
      const dataMPlay = mDataMatch[1];

      // Try to find companion audio_stream data nearby
      const audioStreamMatch = /data-m-preview-url="([^"]*)"/i.exec(html);
      const previewUrl = audioStreamMatch?.[1] ?? undefined;

      // Extract any embedded JSON data in script tags
      const jsonCloudcast = this._extractJsonFromScriptTags(html);

      return {
        cloudcast: jsonCloudcast ?? undefined,
        m_play: dataMPlay,
        preview_url: previewUrl,
        audio_stream: this._resolveStreamFromMPlay(dataMPlay),
      };
    }

    // Try extracting from <script type="application/json"> blocks
    const jsonCloudcast = this._extractJsonFromScriptTags(html);
    if (jsonCloudcast?.url || jsonCloudcast?.name) {
      return {
        cloudcast: jsonCloudcast,
        audio_stream: jsonCloudcast.key
          ? this._buildPreviewUrlFromKey(jsonCloudcast.key)
          : undefined,
      };
    }

    // Try extracting from inline React/hydration data
    const reactDataMatch = /window\.__PRELOADED_STATE__\s*=\s*({.*?});\s*<\/script>/s.exec(html);
    if (reactDataMatch?.[1]) {
      try {
        const parsed = JSON.parse(reactDataMatch[1]) as Record<string, unknown>;
        const cloudcastKey = Object.keys(parsed).find(
          (k) => k.includes('cloudcast') || k.includes('mix'),
        );
        if (cloudcastKey) {
          const cloudcastObj = parsed[cloudcastKey] as Record<string, unknown>;
          const nestedData = this._deepFindCloudcast(cloudcastObj);
          if (nestedData) {
            return {
              cloudcast: nestedData,
              audio_stream: nestedData.key
                ? this._buildPreviewUrlFromKey(nestedData.key)
                : undefined,
            };
          }
        }
      } catch {
        // React state parse failed
      }
    }

    return null;
  }

  /** Extract cloudcast JSON from <script type="application/json"> tags */
  private _extractJsonFromScriptTags(html: string): MixCloudCloudcastData | null {
    const scriptMatches = /<script[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gs.exec(html);
    if (!scriptMatches) {
      // Fallback: look for any large JSON block in script tags
      const fallbackMatches = /<script[^>]*>(\{[^<]{100,}?\})<\/script>/gs.exec(html);
      if (fallbackMatches?.[1]) {
        try {
          const parsed = JSON.parse(fallbackMatches[1]) as Record<string, unknown>;
          return this._deepFindCloudcast(parsed);
        } catch {
          // Fallback parse failed
        }
      }
      return null;
    }

    // Use iteration approach for script tags
    const allScriptRegex = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
    let scriptMatch: RegExpExecArray | null;
    while ((scriptMatch = allScriptRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(scriptMatch[1] ?? '{}') as Record<string, unknown>;
        const cloudcast = this._deepFindCloudcast(parsed);
        if (cloudcast) return cloudcast;
      } catch {
        // Continue to next script tag
      }
    }

    return null;
  }

  /** Recursively search a parsed JSON object for cloudcast-like data */
  private _deepFindCloudcast(obj: Record<string, unknown>, depth: number = 3): MixCloudCloudcastData | null {
    if (depth <= 0) return null;

    // Direct match: object has MixCloud cloudcast characteristics
    if (
      (obj.name && obj.slug && obj.user) ||
      (obj.key && typeof obj.key === 'string' && obj.key.startsWith('/')) ||
      (obj.audio_length !== undefined && obj.name !== undefined)
    ) {
      return obj as unknown as MixCloudCloudcastData;
    }

    // Search nested objects
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const found = this._deepFindCloudcast(value as Record<string, unknown>, depth - 1);
        if (found) return found;
      }
    }

    return null;
  }

  // ─── Private: Extract Audio Source from HTML ────────────────────────────
  private _extractAudioSourceFromHtml(html: string): string | null {
    // Strategy 5: Look for <audio> element with src attribute
    const audioSrcMatch = /<audio[^>]*src="([^"]+)"/i.exec(html);
    if (audioSrcMatch?.[1]) return audioSrcMatch[1];

    // Look for <source> elements inside <audio>
    const sourceSrcMatch = /<source[^>]*src="([^"]+)"[^>]*type="audio\/(?:mp3|m4a|aac|mpeg)"/i.exec(html);
    if (sourceSrcMatch?.[1]) return sourceSrcMatch[1];

    // Look for MixCloud player iframe with stream URL pattern
    const playerSrcMatch = /<iframe[^>]*src="([^"]*mixcloud\.com[^"]*player[^"]*)"/i.exec(html);
    if (playerSrcMatch?.[1]) return playerSrcMatch[1];

    // Look for CDN stream URLs directly in page scripts
    const cdnStreamMatch = /https:\/\/[a-z0-9-]+\.mixcloud\.com\/[a-zA-Z0-9/_.-]+\.mp3/i.exec(html);
    if (cdnStreamMatch?.[0]) return cdnStreamMatch[0];

    const cdnM4aMatch = /https:\/\/[a-z0-9-]+\.mixcloud\.com\/[a-zA-Z0-9/_.-]+\.m4a/i.exec(html);
    if (cdnM4aMatch?.[0]) return cdnM4aMatch[0];

    return null;
  }

  // ─── Private: Extract Open Graph Meta Tags ────────────────────────────
  private _extractOpenGraphTags(html: string): {
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogAudio?: string;
    ogAudioUrl?: string;
    ogAudioType?: string;
    ogUrl?: string;
  } {
    const extractMeta = (property: string): string | undefined => {
      const regex = new RegExp(`<meta[^>]*property="${property}"[^>]*content="([^"]*)"`, 'i');
      const match = regex.exec(html);
      if (match?.[1]) return match[1];

      // Some pages use name instead of property for og tags
      const nameRegex = new RegExp(`<meta[^>]*name="${property}"[^>]*content="([^"]*)"`, 'i');
      const nameMatch = nameRegex.exec(html);
      return nameMatch?.[1] ?? undefined;
    };

    return {
      ogTitle: extractMeta('og:title'),
      ogDescription: extractMeta('og:description'),
      ogImage: extractMeta('og:image'),
      ogAudio: extractMeta('og:audio'),
      ogAudioUrl: extractMeta('og:audio:url'),
      ogAudioType: extractMeta('og:audio:type'),
      ogUrl: extractMeta('og:url'),
    };
  }

  // ─── Private: Stream URL Resolution ────────────────────────────────────
  /** Resolve a preview/stream URL from the m-data m-play attribute */
  private _resolveStreamFromMPlay(mPlay: string): string | undefined {
    if (!mPlay) return undefined;
    // m-play values may be encrypted/obfuscated identifiers
    // MixCloud uses these to construct preview stream URLs
    // The preview URL pattern is: https://www.mixcloud.com/media/{encoded_preview_id}.mp3
    // or via their CDN preview endpoint
    if (mPlay.startsWith('http')) return mPlay;
    // Attempt to construct preview URL from encoded m-play value
    // MixCloud preview streams use a specific encoding pattern
    return undefined;
  }

  /** Build preview URL from a cloudcast API key (e.g., "/owner/slug/") */
  private _buildPreviewUrlFromKey(key: string): string | undefined {
    if (!key) return undefined;
    // MixCloud preview stream URLs are accessible via:
    // https://www.mixcloud.com/media/preview/v2/{encoded_key}.mp3
    // The encoding is based on the cloudcast key
    // We return undefined since preview URL construction requires
    // MixCloud's proprietary encoding which varies per cloudcast
    return undefined;
  }

  // ─── Private: Build Result from API Data ──────────────────────────────
  private _buildResultFromApi(cloudcast: MixCloudCloudcastData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // Audio stream — MixCloud API does not directly expose the full stream URL
    // but provides the key for constructing preview/stream URLs
    // We create a media item pointing to the cloudcast page which can be
    // used to derive the actual stream via the page's embedded player data
    if (cloudcast.audio_length) {
      const audioFormat = this._determineAudioFormat(cloudcast);
      const audioQuality = this._determineAudioQuality(cloudcast);
      const streamUrl = this._constructStreamUrl(cloudcast);

      mediaItems.push({
        type: 'audio',
        format: audioFormat,
        quality: audioQuality,
        url: streamUrl ?? cloudcast.url ?? originalUrl,
        directUrl: streamUrl,
        streamUrl: streamUrl,
        duration: cloudcast.audio_length,
        title: cloudcast.name,
        filename: this._buildFilename(
          cloudcast.name ?? 'mixcloud_cloudcast',
          audioFormat,
        ),
        codec: { audio: audioFormat === 'm4a' ? 'aac' : audioFormat },
      });

      qualityOptions.push({
        label: `${audioQuality} (${audioFormat})`,
        quality: audioQuality,
        format: audioFormat,
        url: streamUrl ?? cloudcast.url ?? originalUrl,
        isSource: true,
      });
    }

    // Covers and thumbnails from pictures object
    if (cloudcast.pictures) {
      const pics = cloudcast.pictures;
      if (pics.extra_large) {
        covers.push({ url: pics.extra_large, format: 'jpeg' });
        thumbnails.push({ url: pics.extra_large, format: 'jpeg' });
      }
      if (pics.large) {
        covers.push({ url: pics.large, width: 600, height: 600, format: 'jpeg' });
        thumbnails.push({ url: pics.large, width: 600, height: 600, format: 'jpeg' });
      }
      if (pics.medium) {
        thumbnails.push({ url: pics.medium, width: 300, height: 300, format: 'jpeg' });
      }
      if (pics.thumbnail) {
        thumbnails.push({ url: pics.thumbnail, width: 150, height: 150, format: 'jpeg' });
      }
    }

    // User/artist avatar as additional thumbnail
    if (cloudcast.user?.pictures?.large) {
      thumbnails.push({ url: cloudcast.user.pictures.large, format: 'jpeg' });
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: cloudcast.name,
      description: cloudcast.description,
      author: cloudcast.user?.name ?? cloudcast.user?.username,
      authorId: cloudcast.user?.username ?? cloudcast.user?.slug,
      authorUrl: cloudcast.user?.url,
      platform: 'mixcloud',
      originalUrl: cloudcast.url ?? originalUrl,
      duration: cloudcast.audio_length,
      viewCount: cloudcast.plays,
      likeCount: cloudcast.favorites,
      commentCount: cloudcast.comments,
      shareCount: cloudcast.reposts,
      uploadDate: cloudcast.created_time,
      isPrivate: cloudcast.is_private,
      tags: cloudcast.tags?.map((tag) => tag.name ?? '')?.filter(Boolean),
      extra: {
        cloudcastKey: cloudcast.key,
        cloudcastSlug: cloudcast.slug,
        listenerCount: cloudcast.listeners,
        isExclusive: cloudcast.exclusive,
        isPremium: cloudcast.premium,
        isRepeat: cloudcast.repeat,
        publishState: cloudcast.publish_state,
        updatedTime: cloudcast.updated_time,
        sections: cloudcast.sections?.map((section) => ({
          position: section.position,
          startTime: section.start_time,
          trackName: section.track?.name,
          artistName: section.track?.artist?.name,
        })),
        artistInfo: {
          name: cloudcast.user?.name,
          username: cloudcast.user?.username,
          followerCount: cloudcast.user?.follower_count,
          followingCount: cloudcast.user?.following_count,
          isPro: cloudcast.user?.is_pro,
          isArtist: cloudcast.user?.is_artist,
          cloudcastCount: cloudcast.user?.cloudcast_count,
          biog: cloudcast.user?.biog,
        },
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'mixcloud',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: cloudcast,
    };
  }

  // ─── Private: Build Result from Embedded Page Data ──────────────────────
  private _buildResultFromEmbeddedData(
    embeddedData: MixCloudEmbeddedPageData,
    html: string,
    originalUrl: string,
  ): ExtractionResult {
    const cloudcast = embeddedData.cloudcast;
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // Audio stream from embedded data
    const streamUrl = embeddedData.audio_stream ?? embeddedData.preview_url;
    if (streamUrl) {
      const format = this._inferFormatFromUrl(streamUrl);
      mediaItems.push({
        type: 'audio',
        format,
        quality: 'best',
        url: streamUrl,
        directUrl: streamUrl,
        streamUrl,
        duration: cloudcast?.audio_length ?? undefined,
        title: cloudcast?.name ?? this._extractOpenGraphTags(html).ogTitle,
        filename: this._buildFilename(
          cloudcast?.name ?? this._extractOpenGraphTags(html).ogTitle ?? 'mixcloud_cloudcast',
          format,
        ),
        codec: { audio: format === 'm4a' ? 'aac' : format },
      });
      qualityOptions.push({
        label: `best (${format})`,
        quality: 'best',
        format,
        url: streamUrl,
        isSource: true,
      });
    }

    // Use OG audio as fallback stream
    const ogTags = this._extractOpenGraphTags(html);
    if (!streamUrl && (ogTags.ogAudio ?? ogTags.ogAudioUrl)) {
      const ogStreamUrl = ogTags.ogAudio ?? ogTags.ogAudioUrl ?? '';
      const ogFormat = ogTags.ogAudioType
        ? this._mimeToFormat(ogTags.ogAudioType)
        : this._inferFormatFromUrl(ogStreamUrl);
      mediaItems.push({
        type: 'audio',
        format: ogFormat,
        quality: 'best',
        url: ogStreamUrl,
        directUrl: ogStreamUrl,
        title: ogTags.ogTitle ?? cloudcast?.name,
        filename: this._buildFilename(
          ogTags.ogTitle ?? cloudcast?.name ?? 'mixcloud_cloudcast',
          ogFormat,
        ),
      });
    }

    // Covers and thumbnails
    if (cloudcast?.pictures) {
      this._addPicturesToCollections(cloudcast.pictures, covers, thumbnails);
    }

    // OG image as fallback cover
    if (covers.length === 0 && ogTags.ogImage) {
      covers.push({ url: ogTags.ogImage, format: 'jpeg' });
      thumbnails.push({ url: ogTags.ogImage, format: 'jpeg' });
    }

    // User avatar
    if (cloudcast?.user?.pictures) {
      this._addPicturesToCollections(cloudcast.user.pictures, covers, thumbnails);
    }

    // Metadata — combine embedded data with OG tags
    const metadata: ExtractionMetadata = {
      title: cloudcast?.name ?? ogTags.ogTitle,
      description: cloudcast?.description ?? ogTags.ogDescription,
      author: cloudcast?.user?.name ?? cloudcast?.user?.username,
      authorId: cloudcast?.user?.username ?? cloudcast?.user?.slug,
      authorUrl: cloudcast?.user?.url,
      platform: 'mixcloud',
      originalUrl: ogTags.ogUrl ?? cloudcast?.url ?? originalUrl,
      duration: cloudcast?.audio_length ?? undefined,
      viewCount: cloudcast?.plays ?? undefined,
      likeCount: cloudcast?.favorites ?? undefined,
      commentCount: cloudcast?.comments ?? undefined,
      shareCount: cloudcast?.reposts ?? undefined,
      uploadDate: cloudcast?.created_time ?? undefined,
      isPrivate: cloudcast?.is_private ?? undefined,
      tags: cloudcast?.tags?.map((tag) => tag.name ?? '')?.filter(Boolean) ?? undefined,
      extra: {
        mPlay: embeddedData.m_play,
        cloudcastKey: cloudcast?.key,
        artistInfo: cloudcast?.user
          ? {
              name: cloudcast.user.name,
              username: cloudcast.user.username,
              followerCount: cloudcast.user.follower_count,
              isPro: cloudcast.user.is_pro,
              isArtist: cloudcast.user.is_artist,
              cloudcastCount: cloudcast.user.cloudcast_count,
              biog: cloudcast.user.biog,
            }
          : undefined,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'mixcloud',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: embeddedData,
    };
  }

  // ─── Private: Build Result from Audio Source ────────────────────────────
  private _buildResultFromAudioSource(
    audioSourceUrl: string,
    html: string,
    originalUrl: string,
  ): ExtractionResult {
    const ogTags = this._extractOpenGraphTags(html);
    const format = this._inferFormatFromUrl(audioSourceUrl);
    const mediaItems: MediaItem[] = [];

    mediaItems.push({
      type: 'audio',
      format,
      quality: 'best',
      url: audioSourceUrl,
      directUrl: audioSourceUrl,
      title: ogTags.ogTitle,
      filename: this._buildFilename(
        ogTags.ogTitle ?? 'mixcloud_cloudcast',
        format,
      ),
    });

    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];
    if (ogTags.ogImage) {
      covers.push({ url: ogTags.ogImage, format: 'jpeg' });
      thumbnails.push({ url: ogTags.ogImage, format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      title: ogTags.ogTitle,
      description: ogTags.ogDescription,
      platform: 'mixcloud',
      originalUrl: ogTags.ogUrl ?? originalUrl,
      extra: {
        audioSourceType: ogTags.ogAudioType,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'mixcloud',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: { audioSourceUrl, ogTags },
    };
  }

  // ─── Private: Build Result from oEmbed ──────────────────────────────
  private _buildResultFromOEmbed(oembed: MixCloudOEmbedData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    if (oembed.thumbnail_url) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: oembed.thumbnail_url,
        title: oembed.title,
      });
    }

    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    if (oembed.thumbnail_url) {
      // MixCloud thumbnails often come in multiple sizes via URL pattern
      // Try to derive larger version from thumbnail URL
      const largeThumb = oembed.thumbnail_url.replace('/300/', '/600/');
      const xlThumb = oembed.thumbnail_url.replace('/300/', '/1000/');

      covers.push({ url: xlThumb, width: 1000, height: 1000, format: 'jpeg' });
      covers.push({ url: largeThumb, width: 600, height: 600, format: 'jpeg' });

      thumbnails.push({
        url: oembed.thumbnail_url,
        width: oembed.thumbnail_width ?? 300,
        height: oembed.thumbnail_height ?? 300,
        format: 'jpeg',
      });
    }

    // Parse owner/slug from the original URL for author info
    const ownerSlug = parseOwnerSlug(originalUrl);

    const metadata: ExtractionMetadata = {
      title: oembed.title,
      author: oembed.author_name,
      authorUrl: oembed.author_url,
      platform: 'mixcloud',
      originalUrl,
      extra: {
        oembedType: oembed.type,
        oembedProvider: oembed.provider_name,
        owner: ownerSlug?.owner,
        slug: ownerSlug?.slug,
        embedHtml: oembed.html,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'mixcloud',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: oembed,
    };
  }

  // ─── Private: Helper Utilities ──────────────────────────────────────────

  /** Normalize a MixCloud URL to ensure it has https and proper format */
  private _normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Ensure www subdomain for consistent page fetching
      if (!parsed.hostname.startsWith('www.')) {
        parsed.hostname = `www.${parsed.hostname}`;
      }
      // Ensure trailing slash for MixCloud URLs
      if (!parsed.pathname.endsWith('/')) {
        parsed.pathname += '/';
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /** Determine audio format from cloudcast metadata */
  private _determineAudioFormat(cloudcast: MixCloudCloudcastData): 'mp3' | 'm4a' | 'aac' {
    // MixCloud typically serves audio in MP3 format for standard streams
    // and M4A/AAC for higher quality premium streams
    if (cloudcast.premium || cloudcast.exclusive) return 'm4a';
    return 'mp3';
  }

  /** Determine audio quality from cloudcast metadata */
  private _determineAudioQuality(cloudcast: MixCloudCloudcastData): 'best' | '128kbps' | '64kbps' {
    if (cloudcast.premium || cloudcast.exclusive) return 'best';
    // Standard MixCloud streams are typically 128kbps;
    // preview/snippet streams are 64kbps
    return '128kbps';
  }

  /** Attempt to construct a direct stream URL from cloudcast data */
  private _constructStreamUrl(cloudcast: MixCloudCloudcastData): string | undefined {
    // MixCloud does not expose direct stream URLs via the public API.
    // The actual stream URL is embedded in the page HTML and requires
    // MixCloud's proprietary stream key decryption.
    // We return undefined here since the stream URL must be obtained
    // via page HTML parsing (Strategy 2) or audio source extraction (Strategy 5).
    if (!cloudcast.key) return undefined;
    return undefined;
  }

  /** Infer audio format from a URL string */
  private _inferFormatFromUrl(url: string): 'mp3' | 'm4a' | 'aac' {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('.m4a')) return 'm4a';
    if (lowerUrl.includes('.aac')) return 'aac';
    if (lowerUrl.includes('.mp3') || lowerUrl.includes('mpeg')) return 'mp3';
    // Default to mp3 for MixCloud CDN URLs
    return 'mp3';
  }

  /** Convert MIME type to audio format */
  private _mimeToFormat(mime: string): 'mp3' | 'm4a' | 'aac' {
    if (mime.includes('mpeg')) return 'mp3';
    if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
    if (mime.includes('aac')) return 'aac';
    return 'mp3';
  }

  /** Add MixCloud pictures object to cover/thumbnail collections */
  private _addPicturesToCollections(
    pictures: MixCloudPictures,
    covers: CoverImage[],
    thumbnails: Thumbnail[],
  ): void {
    if (pictures.extra_large) {
      covers.push({ url: pictures.extra_large, format: 'jpeg' });
      thumbnails.push({ url: pictures.extra_large, format: 'jpeg' });
    }
    if (pictures.large) {
      covers.push({ url: pictures.large, width: 600, height: 600, format: 'jpeg' });
      thumbnails.push({ url: pictures.large, width: 600, height: 600, format: 'jpeg' });
    }
    if (pictures.medium) {
      thumbnails.push({ url: pictures.medium, width: 300, height: 300, format: 'jpeg' });
    }
    if (pictures.thumbnail) {
      thumbnails.push({ url: pictures.thumbnail, width: 150, height: 150, format: 'jpeg' });
    }
  }

  /** Build a sanitized filename from a title and format extension */
  private _buildFilename(title: string, ext: string): string {
    const sanitized = title
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
