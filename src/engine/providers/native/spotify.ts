/**
 * NovaDL Engine — Spotify Native Extractor
 *
 * Parses embedded track metadata from Spotify page source.
 * Note: Spotify does NOT allow audio stream extraction — this extractor
 * only provides metadata, cover images, and preview URLs (30-second clips).
 *
 * Extraction sources:
 * - Spotify oEmbed API
 * - Open Graph meta tags
 * - Embedded data in page HTML
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
  ProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderFeature,
} from '../../types/index';
import { BaseProvider, ProviderError } from '../base';
import { detectPlatform } from '../../utils/url';

// ─── Spotify Data Types ──────────────────────────────────────────────
interface SpotifyOEmbedData {
  title?: string;
  artist?: string;
  artist_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  html?: string;
  type?: string;
  provider_name?: string;
  provider_url?: string;
  width?: number;
  height?: number;
}

interface SpotifyEmbeddedData {
  id?: string;
  type?: string; // track, album, playlist, episode, show
  name?: string;
  uri?: string;
  artists?: Array<{ name?: string; uri?: string }>;
  album?: {
    name?: string;
    uri?: string;
    images?: Array<{ url?: string; width?: number; height?: number }>;
    release_date?: string;
  };
  duration_ms?: number;
  preview_url?: string;
  external_urls?: { spotify?: string };
  popularity?: number;
  explicit?: boolean;
  track_number?: number;
  disc_number?: number;
  is_playable?: boolean;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class SpotifyNativeExtractor extends BaseProvider {
  readonly id = 'native_spotify';
  readonly name = 'Spotify Native Extractor (Metadata Only)';
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
        `Spotify native extractor does not support platform '${platform}'`,
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
    return platform === 'spotify';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['spotify'],
      mediaTypes: ['audio', 'image', 'metadata'],
      formats: ['mp3', 'jpeg', 'png'],
      qualities: ['best'],
      features: [
        'cover_extraction', 'thumbnail_extraction', 'metadata_extraction',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://open.spotify.com', {
        headers: { 'User-Agent': this._userAgent },
        redirect: 'follow',
      });
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
        lastError: error instanceof Error ? error.message : 'Health check failed',
        consecutiveFailures: (this._health.consecutiveFailures ?? 0) + 1,
        consecutiveSuccesses: 0,
        successRate: 0,
      };
    }
  }

  // ─── Private: Main Extraction ──────────────────────────────────────────
  private async _extractFromUrl(url: string): Promise<ExtractionResult> {
    // Strategy 1: Fetch page HTML and parse embedded data
    try {
      const html = await this._fetchPage(url);
      const embeddedData = this._extractEmbeddedData(html);
      if (embeddedData) {
        return this._buildResultFromEmbeddedData(embeddedData, url);
      }
    } catch {
      // Continue
    }

    // Strategy 2: oEmbed API
    try {
      const oembed = await this._fetchOEmbed(url);
      return this._buildResultFromOEmbed(oembed, url);
    } catch {
      // Continue
    }

    // Strategy 3: Meta tags fallback
    try {
      const html = await this._fetchPage(url);
      return this._buildResultFromMetaTags(html, url);
    } catch {
      // All strategies failed
    }

    throw new ProviderError(
      'Could not extract Spotify metadata from page.',
      this.id,
      'PARSE_ERROR',
      false,
      'spotify',
    );
  }

  // ─── Private: Page Fetching ──────────────────────────────────────────
  private async _fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `Spotify page fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'spotify',
      );
    }

    return response.text();
  }

  // ─── Private: Extract Embedded Data ──────────────────────────────────
  private _extractEmbeddedData(html: string): SpotifyEmbeddedData | null {
    // Spotify uses __NEXT_DATA__ for embedded track data
    const nextDataMatch = /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>(.*?)<\/script>/s.exec(html);
    if (nextDataMatch?.[1]) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
        const props = nextData.props as Record<string, unknown> | undefined;
        const pageProps = props?.pageProps as Record<string, unknown> | undefined;
        const trackData = pageProps?.trackData as SpotifyEmbeddedData | undefined;
        if (trackData?.id) return trackData;

        // Try other data keys that Spotify might use
        const localState = pageProps?.localState as Record<string, unknown> | undefined;
        if (localState) {
          const entity = localState.entity as SpotifyEmbeddedData | undefined;
          if (entity?.id) return entity;
        }
      } catch {
        // Parse failed
      }
    }
    return null;
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────
  private async _fetchOEmbed(url: string): Promise<SpotifyOEmbedData> {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': this._userAgent, 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Spotify oEmbed failed: ${response.status}`,
        this.id,
        'NETWORK',
        response.status >= 500,
        'spotify',
      );
    }

    return await response.json() as SpotifyOEmbedData;
  }

  // ─── Private: Build Result from EmbeddedData ──────────────────────────────
  private _buildResultFromEmbeddedData(data: SpotifyEmbeddedData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    // Preview URL (30-second preview clip, if available)
    if (data.preview_url) {
      mediaItems.push({
        type: 'audio',
        format: 'mp3',
        quality: 'best',
        url: data.preview_url,
        directUrl: data.preview_url,
        duration: data.duration_ms ? data.duration_ms / 1000 : 30, // Preview is ~30 seconds
        title: data.name,
        filename: this._buildFilename(data.name ?? 'spotify_preview', 'mp3'),
      });
    }

    // Covers and thumbnails from album images
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    const albumImages = data.album?.images ?? [];
    for (const img of albumImages) {
      if (img.url) {
        covers.push({ url: img.url, width: img.width, height: img.height, format: 'jpeg' });
        thumbnails.push({ url: img.url, width: img.width, height: img.height, format: 'jpeg' });
      }
    }

    // Metadata
    const artistNames = data.artists?.map((a) => a.name ?? '').join(', ');
    const metadata: ExtractionMetadata = {
      title: data.name,
      description: `${artistNames ?? 'Unknown'} — ${data.album?.name ?? 'Unknown Album'}`,
      author: artistNames,
      authorId: data.artists?.[0]?.uri?.replace('spotify:artist:', ''),
      authorUrl: data.artists?.[0]?.uri,
      platform: 'spotify',
      originalUrl: data.external_urls?.spotify ?? originalUrl,
      duration: data.duration_ms ? data.duration_ms / 1000 : undefined,
      uploadDate: data.album?.release_date,
      extra: {
        spotifyId: data.id,
        spotifyType: data.type,
        spotifyUri: data.uri,
        albumName: data.album?.name,
        albumUri: data.album?.uri,
        popularity: data.popularity,
        explicit: data.explicit,
        trackNumber: data.track_number,
        discNumber: data.disc_number,
        isPlayable: data.is_playable,
        hasPreview: Boolean(data.preview_url),
        note: 'Spotify does not allow full audio extraction. Only metadata and 30-second previews are available.',
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'spotify',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: data,
    };
  }

  // ─── Private: Build Result from oEmbed ──────────────────────────────
  private _buildResultFromOEmbed(oembed: SpotifyOEmbedData, originalUrl: string): ExtractionResult {
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
    if (oembed.thumbnail_url) {
      covers.push({
        url: oembed.thumbnail_url,
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height,
        format: 'jpeg',
      });
    }

    const metadata: ExtractionMetadata = {
      title: oembed.title,
      author: oembed.artist,
      authorUrl: oembed.artist_url,
      platform: 'spotify',
      originalUrl,
      extra: {
        providerName: oembed.provider_name,
        oembedType: oembed.type,
        note: 'Spotify does not allow full audio extraction. Only metadata and covers are available.',
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'spotify',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: oembed,
    };
  }

  // ─── Private: Build Result from Meta Tags ──────────────────────────────
  private _buildResultFromMetaTags(html: string, originalUrl: string): ExtractionResult {
    const ogImage = this._extractMetaContent(html, 'og:image');
    const ogTitle = this._extractMetaContent(html, 'og:title');
    const ogDescription = this._extractMetaContent(html, 'og:description');

    const mediaItems: MediaItem[] = [];
    if (ogImage) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: ogImage,
        title: ogTitle,
      });
    }

    const covers: CoverImage[] = [];
    if (ogImage) {
      covers.push({ url: ogImage, format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      title: ogTitle,
      description: ogDescription,
      platform: 'spotify',
      originalUrl,
      extra: {
        note: 'Spotify does not allow full audio extraction. Only metadata and covers are available.',
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'spotify',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────
  private _extractMetaContent(html: string, property: string): string | undefined {
    const pattern = new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
    const match = pattern.exec(html);
    return match?.[1];
  }

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
