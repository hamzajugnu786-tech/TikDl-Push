/**
 * NovaDL Engine — SoundCloud Native Extractor
 *
 * Parses embedded track data from SoundCloud page source to extract
 * audio stream URLs.
 *
 * Extraction sources:
 * - SoundCloud API endpoint for track detail
 * - Embedded player data from page HTML
 * - oEmbed endpoint for metadata
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

// ─── SoundCloud Data Types ──────────────────────────────────────────
interface SoundCloudTrackData {
  id?: number;
  title?: string;
  description?: string;
  permalink_url?: string;
  artwork_url?: string;
  user?: SoundCloudUserData;
  duration?: number; // in milliseconds
  playback_count?: number;
  favoritings_count?: number;
  comment_count?: number;
  download_count?: number;
  original_content_size?: number;
  tag_list?: string;
  genre?: string;
  license?: string;
  created_at?: string;
  last_modified?: string;
  stream_url?: string;
  download_url?: string;
  waveform_url?: string;
  media?: SoundCloudMediaInfo;
  publisher_metadata?: SoundCloudPublisherMetadata;
}

interface SoundCloudUserData {
  id?: number;
  username?: string;
  full_name?: string;
  permalink_url?: string;
  avatar_url?: string;
  description?: string;
}

interface SoundCloudMediaInfo {
  transcodings?: SoundCloudTranscoding[];
}

interface SoundCloudTranscoding {
  url?: string;
  preset?: string;
  quality?: string;
  format?: {
    protocol?: string; // progressive, hls
    mime_type?: string;
  };
  duration?: number;
  bitrate?: number;
  snipped?: boolean;
}

interface SoundCloudPublisherMetadata {
  id?: number;
  artist?: string;
  album_title?: string;
  release_date?: string;
}

interface SoundCloudOEmbedData {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  description?: string;
  type?: string;
  html?: string;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class SoundCloudNativeExtractor extends BaseProvider {
  readonly id = 'native_soundcloud';
  readonly name = 'SoundCloud Native Extractor';
  readonly type: 'custom' = 'custom';

  private _userAgent: string;
  private _clientId: string;

  constructor(config: ProviderConfig) {
    super(config);
    this._userAgent = config.customOptions?.userAgent as string ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this._clientId = config.customOptions?.soundcloudClientId as string ?? '';
  }

  async initialize(): Promise<void> {
    // Try to discover client ID from SoundCloud app.js if not provided
    if (!this._clientId) {
      try {
        this._clientId = await this._discoverClientId();
      } catch {
        // Client ID discovery failed, will try without it
      }
    }

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
        `SoundCloud native extractor does not support platform '${platform}'`,
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
    return platform === 'soundcloud';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['soundcloud'],
      mediaTypes: ['audio', 'image', 'metadata'],
      formats: ['mp3', 'aac', 'opus', 'ogg', 'jpeg', 'png'],
      qualities: ['best', '320kbps', '128kbps', '64kbps'],
      features: [
        'audio_download', 'cover_extraction', 'thumbnail_extraction',
        'metadata_extraction', 'streaming',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://soundcloud.com', {
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
    // Strategy 1: SoundCloud API (resolve endpoint)
    if (this._clientId) {
      try {
        const trackData = await this._resolveTrack(url);
        if (trackData) {
          return this._buildResultFromTrackData(trackData, url);
        }
      } catch {
        // API failed
      }
    }

    // Strategy 2: Page HTML with embedded data
    try {
      const html = await this._fetchPage(url);
      const embeddedData = this._extractEmbeddedData(html);
      if (embeddedData) {
        return this._buildResultFromTrackData(embeddedData, url);
      }
    } catch {
      // Continue to oEmbed
    }

    // Strategy 3: oEmbed endpoint
    try {
      const oembed = await this._fetchOEmbed(url);
      return this._buildResultFromOEmbed(oembed, url);
    } catch {
      // All strategies failed
    }

    throw new ProviderError(
      'Could not extract SoundCloud track data. Client ID may be required.',
      this.id,
      'PARSE_ERROR',
      false,
      'soundcloud',
    );
  }

  // ─── Private: Client ID Discovery ──────────────────────────────────
  private async _discoverClientId(): Promise<string> {
    // SoundCloud embeds the client ID in their app.js bundle
    const appPage = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': this._userAgent },
    });
    const html = await appPage.text();

    // Find the app.js script URL
    const appJsMatch = /<script[^>]*src=["'](https:\/\/a-v2\.sndcdn\.com\/assets\/[^"']*app[^"']*\.js)["']/i.exec(html);
    if (!appJsMatch?.[1]) {
      throw new ProviderError('Could not find SoundCloud app.js URL', this.id, 'PARSE_ERROR', false);
    }

    const appJsResponse = await fetch(appJsMatch[1], {
      headers: { 'User-Agent': this._userAgent },
    });
    const appJs = await appJsResponse.text();

    // Extract client_id from the app.js bundle
    const clientIdMatch = /client_id\s*[=:]\s*"([a-zA-Z0-9]{20,32})"/i.exec(appJs);
    if (clientIdMatch?.[1]) {
      return clientIdMatch[1];
    }

    throw new ProviderError('Could not discover SoundCloud client ID', this.id, 'PARSE_ERROR', false);
  }

  // ─── Private: API Methods ──────────────────────────────────────────
  private async _resolveTrack(url: string): Promise<SoundCloudTrackData | null> {
    const apiUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${this._clientId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) return null;
    return await response.json() as SoundCloudTrackData;
  }

  private async _fetchStreamUrl(transcodingUrl: string): Promise<string | undefined> {
    const url = `${transcodingUrl}?client_id=${this._clientId}`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this._userAgent, 'Accept': 'application/json' },
      });
      if (!response.ok) return undefined;
      const data = await response.json() as { url?: string };
      return data.url;
    } catch {
      return undefined;
    }
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
        `SoundCloud page fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'soundcloud',
      );
    }

    return response.text();
  }

  // ─── Private: Extract Embedded Data ──────────────────────────────────
  private _extractEmbeddedData(html: string): SoundCloudTrackData | null {
    // SoundCloud embeds track data in a script with type="application/json"
    const jsonMatch = /<script[^>]*type="application\/json"[^>]*>(.*?)<\/script>/s.exec(html);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        // Look for track data in various keys
        const trackKeys = ['track', 'sound', 'item', 'data'];
        for (const key of trackKeys) {
          const item = parsed[key] as SoundCloudTrackData | undefined;
          if (item?.id) return item;
        }
      } catch {
        // Parse failed
      }
    }
    return null;
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────
  private async _fetchOEmbed(url: string): Promise<SoundCloudOEmbedData> {
    const oembedUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': this._userAgent, 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new ProviderError(
        `SoundCloud oEmbed failed: ${response.status}`,
        this.id,
        'NETWORK',
        response.status >= 500,
        'soundcloud',
      );
    }

    return await response.json() as SoundCloudOEmbedData;
  }

  // ─── Private: Build Result from TrackData ──────────────────────────────
  private async _buildResultFromTrackData(track: SoundCloudTrackData, originalUrl: string): Promise<ExtractionResult> {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    // Process transcodings (streaming formats)
    if (track.media?.transcodings) {
      // Sort: prefer progressive protocol, higher quality
      const progressiveTranscodings = track.media.transcodings
        .filter((t) => t.format?.protocol === 'progressive' && !t.snipped)
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

      const hlsTranscodings = track.media.transcodings
        .filter((t) => t.format?.protocol === 'hls' && !t.snipped)
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

      // Progressive streams (direct download URLs)
      for (const transcoding of progressiveTranscodings) {
        if (transcoding.url && this._clientId) {
          const streamUrl = await this._fetchStreamUrl(transcoding.url);
          if (streamUrl) {
            const format = this._mimeToFormat(transcoding.format?.mime_type ?? '');
            const quality = this._bitrateToQuality(transcoding.bitrate ?? 0);

            mediaItems.push({
              type: 'audio',
              format,
              quality,
              url: streamUrl,
              directUrl: streamUrl,
              duration: track.duration ? track.duration / 1000 : transcoding.duration,
              bitrate: transcoding.bitrate ? transcoding.bitrate * 1000 : undefined,
              codec: { audio: this._mimeToCodec(transcoding.format?.mime_type ?? '') },
              title: track.title,
              filename: this._buildFilename(track.title ?? 'soundcloud_track', format),
            });

            qualityOptions.push({
              label: `${transcoding.bitrate ?? 0}kbps (${transcoding.preset ?? 'unknown'})`,
              quality,
              format,
              url: streamUrl,
              bitrate: transcoding.bitrate ? transcoding.bitrate * 1000 : undefined,
              isSource: transcoding === progressiveTranscodings[0],
            });
          }
        }
      }

      // HLS streams
      for (const transcoding of hlsTranscodings) {
        if (transcoding.url && this._clientId) {
          const streamUrl = await this._fetchStreamUrl(transcoding.url);
          if (streamUrl) {
            mediaItems.push({
              type: 'audio',
              format: this._mimeToFormat(transcoding.format?.mime_type ?? ''),
              quality: this._bitrateToQuality(transcoding.bitrate ?? 0),
              url: streamUrl,
              streamUrl: streamUrl,
              duration: track.duration ? track.duration / 1000 : transcoding.duration,
              bitrate: transcoding.bitrate ? transcoding.bitrate * 1000 : undefined,
              title: track.title,
            });
          }
        }
      }
    }

    // Legacy stream_url (older API format)
    if (track.stream_url && mediaItems.length === 0) {
      const streamUrl = this._clientId
        ? `${track.stream_url}?client_id=${this._clientId}`
        : track.stream_url;
      mediaItems.push({
        type: 'audio',
        format: 'mp3',
        quality: '128kbps',
        url: streamUrl,
        directUrl: streamUrl,
        duration: track.duration ? track.duration / 1000 : undefined,
        title: track.title,
        filename: this._buildFilename(track.title ?? 'soundcloud_track', 'mp3'),
      });
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    if (track.artwork_url) {
      // SoundCloud artwork URLs end with -t500x500.jpg for large, -t300x300, etc.
      const largeArtwork = track.artwork_url.replace('-t500x500', '-t0x0');
      const mediumArtwork = track.artwork_url.replace('-t500x500', '-t300x300');
      covers.push({ url: largeArtwork, width: 500, height: 500, format: 'jpeg' });
      thumbnails.push({ url: mediumArtwork, width: 300, height: 300, format: 'jpeg' });
      thumbnails.push({ url: track.artwork_url, width: 500, height: 500, format: 'jpeg' });
    }

    // User avatar as additional thumbnail
    if (track.user?.avatar_url) {
      thumbnails.push({ url: track.user.avatar_url, format: 'jpeg' });
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: track.title,
      description: track.description,
      author: track.user?.full_name ?? track.user?.username,
      authorId: track.user?.username ?? track.user?.id?.toString(),
      authorUrl: track.user?.permalink_url,
      platform: 'soundcloud',
      originalUrl: track.permalink_url ?? originalUrl,
      duration: track.duration ? track.duration / 1000 : undefined,
      viewCount: track.playback_count,
      likeCount: track.favoritings_count,
      commentCount: track.comment_count,
      uploadDate: track.created_at,
      categories: track.genre ? [track.genre] : undefined,
      tags: track.tag_list?.split(' ') ?? undefined,
      extra: {
        trackId: track.id?.toString(),
        publisherArtist: track.publisher_metadata?.artist,
        publisherAlbum: track.publisher_metadata?.album_title,
        releaseDate: track.publisher_metadata?.release_date,
        license: track.license,
        downloadCount: track.download_count,
        originalContentSize: track.original_content_size,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'soundcloud',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: track,
    };
  }

  // ─── Private: Build Result from oEmbed ──────────────────────────────
  private _buildResultFromOEmbed(oembed: SoundCloudOEmbedData, originalUrl: string): ExtractionResult {
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
      const largeThumb = oembed.thumbnail_url.replace('-t500x500', '-t0x0');
      covers.push({ url: largeThumb, format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      title: oembed.title,
      description: oembed.description,
      author: oembed.author_name,
      authorUrl: oembed.author_url,
      platform: 'soundcloud',
      originalUrl,
      extra: { oembedType: oembed.type },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'soundcloud',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: oembed,
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────
  private _mimeToFormat(mime: string): 'mp3' | 'aac' | 'opus' | 'ogg' {
    if (mime.includes('mpeg')) return 'mp3';
    if (mime.includes('aac')) return 'aac';
    if (mime.includes('opus')) return 'opus';
    if (mime.includes('ogg')) return 'ogg';
    return 'mp3';
  }

  private _mimeToCodec(mime: string): string {
    if (mime.includes('mpeg')) return 'mp3';
    if (mime.includes('aac')) return 'aac';
    if (mime.includes('opus')) return 'opus';
    if (mime.includes('ogg')) return 'vorbis';
    return 'unknown';
  }

  private _bitrateToQuality(bitrate: number): '320kbps' | '256kbps' | '128kbps' | '64kbps' {
    if (bitrate >= 320) return '320kbps';
    if (bitrate >= 256) return '256kbps';
    if (bitrate >= 128) return '128kbps';
    return '64kbps';
  }

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
