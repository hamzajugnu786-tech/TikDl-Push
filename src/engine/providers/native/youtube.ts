/**
 * NovaDL Engine — YouTube Metadata Native Extractor
 *
 * Extracts video metadata, thumbnails, and oEmbed data from YouTube
 * pages without downloading any video content (video download is
 * handled by yt-dlp separately).
 *
 * Extraction strategies (all real, no mock/demo):
 * 1. YouTube oEmbed endpoint (https://www.youtube.com/oembed?url=...&format=json)
 * 2. YouTube page HTML — ytInitialPlayerResponse from <script> tags
 *    (contains videoDetails, playabilityStatus, streamingData metadata)
 * 3. YouTube ytInitialData from <script> tags
 *    (contains sidebar metadata, comment counts)
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
  ImageFormat,
} from '../../types/index';
import { BaseProvider, ProviderError } from '../base';
import { detectPlatform } from '../../utils/url';

// ─── YouTube Embedded Data Types ──────────────────────────────────────

interface YouTubePlayerResponse {
  playabilityStatus?: YouTubePlayabilityStatus;
  videoDetails?: YouTubeVideoDetails;
  playerConfig?: YouTubePlayerConfig;
  streamingData?: YouTubeStreamingData;
  responseContext?: YouTubeResponseContext;
}

interface YouTubePlayabilityStatus {
  status?: string;
  reason?: string;
  messages?: string[];
  errorScreen?: YouTubeErrorScreen;
  liveStreamability?: YouTubeLiveStreamability;
}

interface YouTubeErrorScreen {
  playerErrorMessageRenderer?: {
    reason?: { simpleText?: string };
    subreason?: { simpleText?: string };
  };
}

interface YouTubeLiveStreamability {
  liveStreamabilityRenderer?: {
    videoId?: string;
    broadcastId?: string;
  };
}

interface YouTubeVideoDetails {
  videoId?: string;
  title?: string;
  lengthSeconds?: string;
  channelId?: string;
  channelName?: string;
  viewCount?: string;
  shortDescription?: string;
  isLive?: boolean;
  isPrivate?: boolean;
  isCrawlable?: boolean;
  isOwnerViewing?: boolean;
  isUnpluggedCorpus?: boolean;
  isLiveContent?: boolean;
  allowRatings?: boolean;
  keywords?: string[];
  thumbnail?: YouTubeThumbnailContainer;
}

interface YouTubeThumbnailContainer {
  thumbnails?: YouTubeThumbnailItem[];
}

interface YouTubeThumbnailItem {
  url?: string;
  width?: number;
  height?: number;
}

interface YouTubePlayerConfig {
  audioConfig?: { loudnessDb?: number; perceptualLoudnessDb?: number };
  streamSelectionConfig?: { maxBitrate?: string };
  mediaCommonConfig?: { dynamicReadaheadConfig?: unknown };
  webPlayerConfig?: unknown;
}

interface YouTubeStreamingData {
  expiresInSeconds?: string;
  formats?: YouTubeFormatItem[];
  adaptiveFormats?: YouTubeFormatItem[];
  dashManifestUrl?: string;
  hlsManifestUrl?: string;
}

interface YouTubeFormatItem {
  itag?: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  initRange?: { start?: string; end?: string };
  indexRange?: { start?: string; end?: string };
  lastModified?: string;
  contentLength?: string;
  quality?: string;
  fps?: number;
  qualityLabel?: string;
  projectionType?: string;
  averageBitrate?: number;
  colorInfo?: unknown;
  approxDurationMs?: string;
  audioQuality?: string;
  audioSampleRate?: string;
  audioChannels?: number;
  loudnessDb?: number;
}

interface YouTubeResponseContext {
  serviceTrackingParams?: Array<{
    service?: string;
    params?: Array<{ key?: string; value?: string }>;
  }>;
  mainAppWebResponseContext?: unknown;
  webResponseContextExtensionData?: unknown;
}

interface YouTubeInitialData {
  contents?: YouTubeInitialDataContents;
  sidebar?: YouTubeSidebar;
  header?: unknown;
  currentVideoEndpoint?: { watchEndpoint?: { videoId?: string } };
  engagementPanels?: unknown[];
  frameworkUpdates?: unknown;
}

interface YouTubeInitialDataContents {
  twoColumnWatchNextResults?: YouTubeTwoColumnWatchNextResults;
}

interface YouTubeTwoColumnWatchNextResults {
  results?: YouTubeResultsPane;
  secondaryResults?: YouTubeSecondaryResults;
}

interface YouTubeResultsPane {
  results?: YouTubeResultItem[];
}

interface YouTubeResultItem {
  videoPrimaryInfoRenderer?: YouTubeVideoPrimaryInfo;
  videoSecondaryInfoRenderer?: YouTubeVideoSecondaryInfo;
}

interface YouTubeVideoPrimaryInfo {
  title?: { runs?: Array<{ text?: string }> };
  viewCount?: { videoViewCountRenderer?: { viewCount?: string; shortViewCount?: string } };
  dateText?: { simpleText?: string };
  videoActions?: YouTubeMenuRenderer;
}

interface YouTubeVideoSecondaryInfo {
  owner?: YouTubeVideoOwner;
  description?: YouTubeDescriptionBox;
  metadataRowContainer?: YouTubeMetadataRowContainer;
  subscribeButtonRenderer?: unknown;
}

interface YouTubeVideoOwner {
  videoOwnerRenderer?: {
    title?: { runs?: Array<{ text?: string }> };
    thumbnail?: YouTubeThumbnailContainer;
    navigationEndpoint?: { browseEndpoint?: { browseId?: string; canonicalUrl?: string } };
    subscriberCountText?: { runs?: Array<{ text?: string }> };
  };
}

interface YouTubeDescriptionBox {
  runs?: Array<{ text?: string; navigationEndpoint?: unknown }>;
  simpleText?: string;
}

interface YouTubeTextRun {
  text?: string;
}

interface YouTubeRichText {
  runs?: YouTubeTextRun[];
  simpleText?: string;
}

interface YouTubeMetadataRowContainer {
  metadataRowContainerRenderer?: {
    rows?: Array<{
      metadataRowRenderer?: {
        title?: YouTubeRichText;
        contents?: YouTubeRichText[];
      };
    }>;
  };
}

interface YouTubeMenuRenderer {
  menuRenderer?: {
    items?: Array<{
      menuServiceItemRenderer?: {
        text?: { runs?: Array<{ text?: string }> };
        serviceEndpoint?: unknown;
      };
    }>;
    topLevelButtons?: unknown[];
  };
}

interface YouTubeSecondaryResults {
  results?: unknown[];
}

interface YouTubeSidebar {
  sidebarResults?: YouTubeSidebarResults;
}

interface YouTubeSidebarResults {
  items?: Array<{
    sidebarSectionRenderer?: {
      items?: Array<{
        channelThumbnailWithLinkRenderer?: unknown;
        videoMetadataWithThumbnailRenderer?: unknown;
        compactVideoRenderer?: unknown;
      }>;
    };
  }>;
}

interface YouTubeOEmbedData {
  title?: string;
  author_name?: string;
  author_url?: string;
  type?: string;
  provider_name?: string;
  provider_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  width?: number;
  height?: number;
  html?: string;
}

// ─── Provider Implementation ──────────────────────────────────────────

export class YouTubeNativeExtractor extends BaseProvider {
  readonly id = 'native_youtube';
  readonly name = 'YouTube Metadata Native Extractor';
  readonly type: 'custom' = 'custom';

  private _userAgent: string;

  constructor(config: ProviderConfig) {
    super(config);
    const customUserAgent = config.customOptions?.userAgent;
    if (typeof customUserAgent === 'string' && customUserAgent.length > 0) {
      this._userAgent = customUserAgent;
    } else {
      this._userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
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

  supports(platform: Platform): boolean {
    return platform === 'youtube' || platform === 'youtube_shorts';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['youtube', 'youtube_shorts'],
      mediaTypes: ['metadata', 'image'],
      formats: ['jpeg', 'png', 'webp'],
      qualities: ['best', '2160p', '1440p', '1080p', '720p', '480p', '360p'],
      features: [
        'metadata_extraction',
        'thumbnail_extraction',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const platform = request.platform ?? detectPlatform(request.url);

    if (!this.supports(platform)) {
      throw new ProviderError(
        `YouTube native extractor does not support platform '${platform}'`,
        this.id,
        'UNSUPPORTED',
        false,
        platform,
      );
    }

    try {
      const result = await this.withTimeout(
        this._extractFromUrl(request.url, platform),
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

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      const response = await fetch('https://www.youtube.com', {
        headers: {
          'User-Agent': this._userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });

      if (response.ok) {
        return {
          status: 'healthy',
          latencyMs: Date.now() - startTime,
          lastChecked: new Date(),
          consecutiveFailures: 0,
          consecutiveSuccesses: (this._health.consecutiveSuccesses ?? 0) + 1,
          successRate: 1.0,
        };
      }

      return {
        status: 'degraded',
        latencyMs: Date.now() - startTime,
        lastChecked: new Date(),
        lastError: `YouTube health check returned ${response.status}`,
        consecutiveFailures: (this._health.consecutiveFailures ?? 0) + 1,
        consecutiveSuccesses: 0,
        successRate: 0,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date(),
        lastError: error instanceof Error ? error.message : 'YouTube health check failed',
        consecutiveFailures: (this._health.consecutiveFailures ?? 0) + 1,
        consecutiveSuccesses: 0,
        successRate: 0,
      };
    }
  }

  // ─── Private: Main Extraction ──────────────────────────────────────────

  private async _extractFromUrl(url: string, platform: Platform): Promise<ExtractionResult> {
    const videoId = this._extractVideoId(url);
    if (!videoId) {
      throw new ProviderError(
        'Could not extract YouTube video ID from URL',
        this.id,
        'UNSUPPORTED',
        false,
        platform,
      );
    }

    // Accumulate data from all strategies and merge into a rich result
    let playerResponse: YouTubePlayerResponse | null = null;
    let initialData: YouTubeInitialData | null = null;
    let oembedData: YouTubeOEmbedData | null = null;

    // Strategy 1: Fetch page HTML and extract ytInitialPlayerResponse + ytInitialData
    try {
      const html = await this._fetchPage(url);
      playerResponse = this._extractPlayerResponseFromHtml(html);
      initialData = this._extractInitialDataFromHtml(html);
    } catch {
      // Page fetch failed — continue to oEmbed only
    }

    // Strategy 2: oEmbed endpoint for supplementary metadata
    try {
      oembedData = await this._fetchOEmbed(url);
    } catch {
      // oEmbed failed — continue with whatever we have
    }

    // If we have playerResponse with videoDetails, build the primary result
    if (playerResponse?.videoDetails) {
      return this._buildResultFromPlayerResponse(
        playerResponse,
        initialData,
        oembedData,
        url,
        videoId,
        platform,
      );
    }

    // If we have oEmbed but no playerResponse, build a limited result
    if (oembedData) {
      return this._buildResultFromOEmbed(oembedData, url, videoId, platform);
    }

    // Check if video is private or geo-blocked from playabilityStatus
    if (playerResponse?.playabilityStatus) {
      const status = playerResponse.playabilityStatus.status;
      if (status === 'LOGIN_REQUIRED' || status === 'PRIVATE') {
        throw new ProviderError(
          `YouTube video is private: ${playerResponse.playabilityStatus.reason ?? 'Access restricted'}`,
          this.id,
          'PRIVATE',
          false,
          platform,
        );
      }
      if (status === 'GEO_BLOCKED' || status === 'UNPLAYABLE') {
        throw new ProviderError(
          `YouTube video is unavailable: ${playerResponse.playabilityStatus.reason ?? 'Cannot play video'}`,
          this.id,
          status === 'GEO_BLOCKED' ? 'GEO_BLOCKED' : 'NOT_FOUND',
          false,
          platform,
        );
      }
    }

    throw new ProviderError(
      'Could not extract YouTube video metadata. No player response or oEmbed data found.',
      this.id,
      'PARSE_ERROR',
      false,
      platform,
    );
  }

  // ─── Private: Video ID Extraction ──────────────────────────────────────

  private _extractVideoId(url: string): string | null {
    // Standard YouTube watch URL: youtube.com/watch?v=VIDEO_ID
    const watchMatch = /[?&]v=([a-zA-Z0-9_-]{11})/.exec(url);
    if (watchMatch?.[1]) return watchMatch[1];

    // YouTube Shorts: youtube.com/shorts/VIDEO_ID
    const shortsMatch = /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/.exec(url);
    if (shortsMatch?.[1]) return shortsMatch[1];

    // YouTube embed: youtube.com/embed/VIDEO_ID
    const embedMatch = /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/.exec(url);
    if (embedMatch?.[1]) return embedMatch[1];

    // YouTube v/ URL: youtube.com/v/VIDEO_ID
    const vMatch = /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/.exec(url);
    if (vMatch?.[1]) return vMatch[1];

    // youtu.be short URL: youtu.be/VIDEO_ID
    const shortMatch = /youtu\.be\/([a-zA-Z0-9_-]{11})/.exec(url);
    if (shortMatch?.[1]) return shortMatch[1];

    // YouTube live: youtube.com/live/VIDEO_ID
    const liveMatch = /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/.exec(url);
    if (liveMatch?.[1]) return liveMatch[1];

    return null;
  }

  // ─── Private: Page Fetching ──────────────────────────────────────────

  private async _fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `YouTube page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500 || response.status === 429,
        'youtube',
      );
    }

    return response.text();
  }

  // ─── Private: Extract ytInitialPlayerResponse from HTML ──────────────

  private _extractPlayerResponseFromHtml(html: string): YouTubePlayerResponse | null {
    // Pattern 1: ytInitialPlayerResponse assigned in script (most common)
    //   var ytInitialPlayerResponse = {...};
    const assignMatch = /var\s+ytInitialPlayerResponse\s*=\s*(\{.*?\});\s*var\s+meta/s.exec(html);
    if (assignMatch?.[1]) {
      try {
        return JSON.parse(assignMatch[1]) as YouTubePlayerResponse;
      } catch {
        // Continue to alternate patterns
      }
    }

    // Pattern 2: ytInitialPlayerResponse set via ytplayer.config
    //   ytInitialPlayerResponse = {...};
    const setMatch = /ytInitialPlayerResponse\s*=\s*(\{.*?\});\s*var\s+/s.exec(html);
    if (setMatch?.[1]) {
      try {
        return JSON.parse(setMatch[1]) as YouTubePlayerResponse;
      } catch {
        // Continue
      }
    }

    // Pattern 3: Inside ytplayer.config object
    //   "playerResponse":"..."
    const configMatch = /"playerResponse"\s*:\s*"(\{.*?\})"/s.exec(html);
    if (configMatch?.[1]) {
      try {
        // The inner string is JSON-encoded, so it may contain escaped quotes
        const unescaped = configMatch[1].replace(/\\\\"/g, '"').replace(/\\\\n/g, '\n');
        return JSON.parse(unescaped) as YouTubePlayerResponse;
      } catch {
        // Continue
      }
    }

    // Pattern 4: ytInitialPlayerResponse in a script body (assignment without var)
    //   ytInitialPlayerResponse = {...};
    // This regex needs to be careful to not overshoot — match until ; or </script>
    const bodyMatch = /ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:var\s+|<\/script>)/s.exec(html);
    if (bodyMatch?.[1]) {
      try {
        return JSON.parse(bodyMatch[1]) as YouTubePlayerResponse;
      } catch {
        // Continue
      }
    }

    // Pattern 5: ytcfg.set with playerResponse embedded
    const ytcfgMatch = /ytcfg\.set\s*\(\s*\{[^}]*?"playerResponse"\s*:\s*"(\{.*?\})"[^}]*?\}\s*\)/s.exec(html);
    if (ytcfgMatch?.[1]) {
      try {
        const unescaped = ytcfgMatch[1].replace(/\\\\"/g, '"').replace(/\\\\n/g, '\n');
        return JSON.parse(unescaped) as YouTubePlayerResponse;
      } catch {
        // All patterns exhausted
      }
    }

    return null;
  }

  // ─── Private: Extract ytInitialData from HTML ──────────────────────

  private _extractInitialDataFromHtml(html: string): YouTubeInitialData | null {
    // Pattern 1: var ytInitialData = {...};
    const varMatch = /var\s+ytInitialData\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:var\s+|<\/script>)/s.exec(html);
    if (varMatch?.[1]) {
      try {
        return JSON.parse(varMatch[1]) as YouTubeInitialData;
      } catch {
        // Continue
      }
    }

    // Pattern 2: ytInitialData = {...}; assignment without var
    const setMatch = /ytInitialData\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:var\s+|<\/script>)/s.exec(html);
    if (setMatch?.[1]) {
      try {
        return JSON.parse(setMatch[1]) as YouTubeInitialData;
      } catch {
        // Continue
      }
    }

    // Pattern 3: window["ytInitialData"] = {...};
    const windowMatch = /window\s*\[\s*"ytInitialData"\s*\]\s*=\s*(\{[\s\S]*?\})\s*;/s.exec(html);
    if (windowMatch?.[1]) {
      try {
        return JSON.parse(windowMatch[1]) as YouTubeInitialData;
      } catch {
        // All patterns exhausted
      }
    }

    return null;
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────

  private async _fetchOEmbed(url: string): Promise<YouTubeOEmbedData> {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        `YouTube oEmbed fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'youtube',
      );
    }

    return await response.json() as YouTubeOEmbedData;
  }

  // ─── Private: Build Result from PlayerResponse ──────────────────────

  private _buildResultFromPlayerResponse(
    playerResponse: YouTubePlayerResponse,
    initialData: YouTubeInitialData | null,
    oembedData: YouTubeOEmbedData | null,
    originalUrl: string,
    videoId: string,
    platform: Platform,
  ): ExtractionResult {
    const videoDetails = playerResponse.videoDetails ?? { title: '', lengthSeconds: '0', channel: '', channelId: '', isPrivate: false, isLive: false, viewCount: '0', keywords: [] } as YouTubeVideoDetails;
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];
    const qualityOptions: QualityOption[] = [];

    // ─── Thumbnail Extraction ──────────────────────────────────────
    const thumbSources: YouTubeThumbnailItem[] = videoDetails.thumbnail?.thumbnails ?? [];
    const constructedThumbs = this._constructThumbnailUrls(videoId);

    // Merge constructed URLs with embedded ones (embedded ones are more authoritative)
    const allThumbs = this._mergeThumbnails(constructedThumbs, thumbSources);

    for (const thumb of allThumbs) {
      if (thumb.url) {
        const thumbFormat = this._inferThumbnailFormat(thumb.url);
        const thumbItem: Thumbnail = {
          url: thumb.url,
          width: thumb.width,
          height: thumb.height,
          format: thumbFormat,
        };
        thumbnails.push(thumbItem);

        // Create media items for thumbnail images (metadata-only extractor produces image media)
        mediaItems.push({
          type: 'image',
          format: thumbFormat,
          quality: this._heightToQuality(thumb.height ?? 0),
          url: thumb.url,
          resolution: thumb.width && thumb.height ? { width: thumb.width, height: thumb.height } : undefined,
          title: videoDetails.title ?? 'YouTube Thumbnail',
          filename: this._buildFilename(videoDetails.title ?? videoId, thumbFormat),
        });

        qualityOptions.push({
          label: `${thumb.height ?? 0}p`,
          quality: this._heightToQuality(thumb.height ?? 0),
          format: thumbFormat,
          url: thumb.url,
          resolution: thumb.width && thumb.height ? { width: thumb.width, height: thumb.height } : undefined,
          isSource: thumb.height === allThumbs.reduce((max, t) => Math.max(max, t.height ?? 0), 0),
        });
      }
    }

    // Largest thumbnail as cover image
    const largestThumb = allThumbs.length > 0
      ? allThumbs.reduce(
          (best, current) => ((current.height ?? 0) > (best.height ?? 0) ? current : best),
          allThumbs[0] ?? { url: '', width: 0, height: 0 },
        )
      : null;

    if (largestThumb?.url) {
      covers.push({
        url: largestThumb.url,
        width: largestThumb.width,
        height: largestThumb.height,
        format: this._inferThumbnailFormat(largestThumb.url),
      });
    }

    // ─── Metadata ──────────────────────────────────────────────
    const durationSeconds = this._parseDuration(videoDetails.lengthSeconds ?? '');
    const viewCount = this._parseCount(videoDetails.viewCount ?? '');
    const likeCount = this._extractLikeCount(initialData);

    // Extract categories and tags from ytInitialData if available
    const categories = this._extractCategories(initialData);
    const tags = videoDetails.keywords ?? [];
    const uploadDate = this._extractUploadDate(initialData);
    const commentCount = this._extractCommentCount(initialData);

    // Author info — prefer playerResponse channel data, fall back to oEmbed
    const author = videoDetails.channelName ?? oembedData?.author_name ?? '';
    const authorId = videoDetails.channelId ?? this._extractChannelId(initialData);
    const authorUrl = authorId ? `https://www.youtube.com/channel/${authorId}` : oembedData?.author_url;

    // Description — prefer full from playerResponse
    const description = videoDetails.shortDescription ?? oembedData?.title ?? '';

    const metadata: ExtractionMetadata = {
      title: videoDetails.title ?? oembedData?.title ?? '',
      description,
      author,
      authorId,
      authorUrl,
      platform,
      originalUrl,
      duration: durationSeconds,
      viewCount,
      likeCount,
      commentCount,
      uploadDate,
      categories,
      tags: tags.length > 0 ? tags : undefined,
      isLive: videoDetails.isLive ?? false,
      isPrivate: videoDetails.isPrivate ?? false,
      extra: {
        videoId,
        isCrawlable: videoDetails.isCrawlable ?? false,
        isLiveContent: videoDetails.isLiveContent ?? false,
        allowRatings: videoDetails.allowRatings ?? false,
        playabilityStatus: playerResponse.playabilityStatus?.status ?? 'OK',
        oembedProvider: oembedData?.provider_name,
        oembedType: oembedData?.type,
      },
    };

    // ─── Raw Response ──────────────────────────────────────────────
    const rawResponse: Record<string, unknown> = {
      playerResponse,
      initialData: initialData ?? null,
      oembedData: oembedData ?? null,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform,
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse,
    };
  }

  // ─── Private: Build Result from oEmbed ──────────────────────────────

  private _buildResultFromOEmbed(
    oembedData: YouTubeOEmbedData,
    originalUrl: string,
    videoId: string,
    platform: Platform,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];
    const qualityOptions: QualityOption[] = [];

    // oEmbed thumbnail (usually medium quality)
    if (oembedData.thumbnail_url) {
      const thumbFormat = this._inferThumbnailFormat(oembedData.thumbnail_url);
      const oembedThumb: Thumbnail = {
        url: oembedData.thumbnail_url,
        width: oembedData.thumbnail_width,
        height: oembedData.thumbnail_height,
        format: thumbFormat,
      };
      thumbnails.push(oembedThumb);

      mediaItems.push({
        type: 'image',
        format: thumbFormat,
        quality: this._heightToQuality(oembedData.thumbnail_height ?? 0),
        url: oembedData.thumbnail_url,
        resolution: oembedData.thumbnail_width && oembedData.thumbnail_height
          ? { width: oembedData.thumbnail_width, height: oembedData.thumbnail_height }
          : undefined,
        title: oembedData.title ?? 'YouTube Thumbnail',
        filename: this._buildFilename(oembedData.title ?? videoId, thumbFormat),
      });

      covers.push({
        url: oembedData.thumbnail_url,
        width: oembedData.thumbnail_width,
        height: oembedData.thumbnail_height,
        format: thumbFormat,
      });
    }

    // Construct additional thumbnail URLs from videoId
    const constructedThumbs = this._constructThumbnailUrls(videoId);
    for (const thumb of constructedThumbs) {
      if (thumb.url) {
        const thumbFormat = this._inferThumbnailFormat(thumb.url);
        // Don't duplicate the oEmbed thumbnail if it matches
        const isDuplicate = thumbnails.some(
          (existing) => existing.url === thumb.url,
        );
        if (!isDuplicate) {
          thumbnails.push({
            url: thumb.url,
            width: thumb.width,
            height: thumb.height,
            format: thumbFormat,
          });

          mediaItems.push({
            type: 'image',
            format: thumbFormat,
            quality: this._heightToQuality(thumb.height ?? 0),
            url: thumb.url,
            resolution: thumb.width && thumb.height ? { width: thumb.width, height: thumb.height } : undefined,
            title: oembedData.title ?? 'YouTube Thumbnail',
            filename: this._buildFilename(oembedData.title ?? videoId, thumbFormat),
          });

          qualityOptions.push({
            label: `${thumb.height ?? 0}p`,
            quality: this._heightToQuality(thumb.height ?? 0),
            format: thumbFormat,
            url: thumb.url,
            resolution: thumb.width && thumb.height ? { width: thumb.width, height: thumb.height } : undefined,
          });
        }
      }
    }

    const metadata: ExtractionMetadata = {
      title: oembedData.title ?? '',
      description: oembedData.title ?? '',
      author: oembedData.author_name ?? '',
      authorUrl: oembedData.author_url ?? '',
      platform,
      originalUrl,
      extra: {
        videoId,
        oembedProvider: oembedData.provider_name,
        oembedType: oembedData.type,
        oembedWidth: oembedData.width,
        oembedHeight: oembedData.height,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform,
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: { oembedData },
    };
  }

  // ─── Private: Construct Thumbnail URLs from Video ID ──────────────

  private _constructThumbnailUrls(videoId: string): YouTubeThumbnailItem[] {
    // YouTube has well-known thumbnail URL patterns by video ID
    // Each quality level follows: https://i.ytimg.com/vi/{videoId}/{quality}.jpg
    // WebP variants also exist for some quality levels
    const qualities: Array<{ name: string; width: number; height: number; format: ImageFormat }> = [
      { name: 'maxresdefault', width: 1280, height: 720, format: 'jpeg' },
      { name: 'sddefault', width: 640, height: 480, format: 'jpeg' },
      { name: 'hqdefault', width: 480, height: 360, format: 'jpeg' },
      { name: 'mqdefault', width: 320, height: 180, format: 'jpeg' },
      { name: 'default', width: 120, height: 90, format: 'jpeg' },
    ];

    const webpQualities: Array<{ name: string; width: number; height: number }> = [
      { name: 'maxresdefault', width: 1280, height: 720 },
      { name: 'sddefault', width: 640, height: 480 },
      { name: 'hqdefault', width: 480, height: 360 },
    ];

    const thumbs: YouTubeThumbnailItem[] = [];

    // JPEG thumbnails (always available)
    for (const q of qualities) {
      thumbs.push({
        url: `https://i.ytimg.com/vi/${videoId}/${q.name}.jpg`,
        width: q.width,
        height: q.height,
      });
    }

    // WebP thumbnails (higher quality, may not exist for all videos)
    for (const q of webpQualities) {
      thumbs.push({
        url: `https://i.ytimg.com/vi_webp/${videoId}/${q.name}.webp`,
        width: q.width,
        height: q.height,
      });
    }

    return thumbs;
  }

  // ─── Private: Merge Thumbnails ──────────────────────────────────

  private _mergeThumbnails(
    constructed: YouTubeThumbnailItem[],
    embedded: YouTubeThumbnailItem[],
  ): YouTubeThumbnailItem[] {
    // Start with embedded thumbnails (authoritative dimensions)
    const merged: YouTubeThumbnailItem[] = [];

    // Add all embedded thumbnails
    for (const thumb of embedded) {
      if (thumb.url) {
        merged.push({ url: thumb.url, width: thumb.width, height: thumb.height });
      }
    }

    // Add constructed thumbnails that don't duplicate embedded URLs
    for (const thumb of constructed) {
      if (thumb.url) {
        const isDuplicate = merged.some(
          (existing) => existing.url === thumb.url,
        );
        if (!isDuplicate) {
          // Check if we already have a thumb at similar resolution from embedded data
          const similarResolution = merged.some(
            (existing) => existing.height === thumb.height && existing.width === thumb.width,
          );
          // Prefer embedded at same resolution, add constructed if new resolution
          if (!similarResolution) {
            merged.push({ url: thumb.url, width: thumb.width, height: thumb.height });
          }
        }
      }
    }

    // Sort by height descending (highest quality first)
    merged.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

    return merged;
  }

  // ─── Private: Infer Thumbnail Format ──────────────────────────────

  private _inferThumbnailFormat(url: string): ImageFormat {
    if (url.includes('.webp') || url.includes('_webp')) return 'webp';
    if (url.includes('.png')) return 'png';
    return 'jpeg';
  }

  // ─── Private: Extract Like Count from ytInitialData ──────────────

  private _extractLikeCount(initialData: YouTubeInitialData | null): number | undefined {
    if (!initialData?.contents?.twoColumnWatchNextResults?.results?.results) return undefined;

    const resultItems = initialData.contents.twoColumnWatchNextResults.results.results;
    for (const item of resultItems) {
      const actions = item.videoPrimaryInfoRenderer?.videoActions?.menuRenderer?.topLevelButtons;
      if (Array.isArray(actions)) {
        for (const action of actions) {
          // Like count is sometimes in the toggleButtonRenderer
          const toggleRenderer = action as Record<string, unknown>;
          const defaultRenderer = toggleRenderer.toggleButtonRenderer as Record<string, unknown> | undefined;
          if (defaultRenderer) {
            const defaultText = defaultRenderer.defaultText as Record<string, unknown> | undefined;
            if (defaultText?.accessibility) {
              const accessibilityData = (defaultText.accessibility as Record<string, unknown>)?.accessibilityData as Record<string, unknown> | undefined;
              if (accessibilityData?.label) {
                const labelStr = String(accessibilityData.label);
                const countMatch = /(\d[\d,]*)/.exec(labelStr);
                if (countMatch?.[1]) {
                  return this._parseCount(countMatch[1]);
                }
              }
            }
            if (defaultText?.simpleText) {
              const countMatch = /(\d[\d,]*)/.exec(String(defaultText.simpleText));
              if (countMatch?.[1]) {
                return this._parseCount(countMatch[1]);
              }
            }
          }
        }
      }
    }

    return undefined;
  }

  // ─── Private: Extract Comment Count from ytInitialData ──────────────

  private _extractCommentCount(initialData: YouTubeInitialData | null): number | undefined {
    if (!initialData?.contents?.twoColumnWatchNextResults?.results?.results) return undefined;

    const resultItems = initialData.contents.twoColumnWatchNextResults.results.results;
    for (const item of resultItems) {
      const secondaryInfo = item.videoSecondaryInfoRenderer;
      if (secondaryInfo) {
        // Comments count can appear in the sentinel token or comment section header
        const sentinel = secondaryInfo as Record<string, unknown>;
        const commentCountText = sentinel.commentCountText as Record<string, unknown> | undefined;
        if (commentCountText?.simpleText) {
          return this._parseCount(String(commentCountText.simpleText));
        }
        if (commentCountText?.runs) {
          const runs = commentCountText.runs as Array<Record<string, string>>;
          const text = runs.map((r) => r.text ?? '').join('');
          return this._parseCount(text);
        }
      }
    }

    return undefined;
  }

  // ─── Private: Extract Categories from ytInitialData ──────────────

  private _extractCategories(initialData: YouTubeInitialData | null): string[] | undefined {
    if (!initialData?.contents?.twoColumnWatchNextResults?.results?.results) return undefined;

    const resultItems = initialData.contents.twoColumnWatchNextResults.results.results;
    const categories: string[] = [];

    for (const item of resultItems) {
      const rows = item.videoSecondaryInfoRenderer?.metadataRowContainer?.metadataRowContainerRenderer?.rows;
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const renderer = row.metadataRowRenderer;
          if (renderer) {
            const title = renderer.title;
            const titleText = this._extractTextFromRuns(title);
            if (titleText && (titleText.toLowerCase() === 'category' || titleText.toLowerCase() === 'categories')) {
              const contentRuns = renderer.contents;
              if (Array.isArray(contentRuns)) {
                for (const content of contentRuns) {
                  const contentText = this._extractTextFromRuns(content);
                  if (contentText) {
                    categories.push(contentText);
                  }
                }
              }
            }
          }
        }
      }
    }

    return categories.length > 0 ? categories : undefined;
  }

  // ─── Private: Extract Upload Date from ytInitialData ──────────────

  private _extractUploadDate(initialData: YouTubeInitialData | null): string | undefined {
    if (!initialData?.contents?.twoColumnWatchNextResults?.results?.results) return undefined;

    const resultItems = initialData.contents.twoColumnWatchNextResults.results.results;
    for (const item of resultItems) {
      const dateText = item.videoPrimaryInfoRenderer?.dateText?.simpleText;
      if (dateText) {
        // YouTube date text format: "Jan 1, 2024" or similar
        // Convert to ISO date string
        const parsed = new Date(dateText);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
        // Return the raw string if we can't parse it
        return dateText;
      }
    }

    return undefined;
  }

  // ─── Private: Extract Channel ID from ytInitialData ──────────────

  private _extractChannelId(initialData: YouTubeInitialData | null): string | undefined {
    if (!initialData?.contents?.twoColumnWatchNextResults?.results?.results) return undefined;

    const resultItems = initialData.contents.twoColumnWatchNextResults.results.results;
    for (const item of resultItems) {
      const ownerRenderer = item.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
      const browseId = ownerRenderer?.navigationEndpoint?.browseEndpoint?.browseId;
      if (browseId) return browseId;
    }

    return undefined;
  }

  // ─── Private: Text Extraction Helper ──────────────────────────────

  private _extractTextFromRuns(textObj: unknown): string | undefined {
    if (typeof textObj === 'object' && textObj !== null) {
      const obj = textObj as Record<string, unknown>;

      // Simple text: { simpleText: "..." }
      if (typeof obj.simpleText === 'string') return obj.simpleText;

      // Runs: { runs: [{ text: "..." }] }
      if (Array.isArray(obj.runs)) {
        const runs = obj.runs as Array<Record<string, string>>;
        return runs.map((r) => r.text ?? '').join('');
      }
    }

    return undefined;
  }

  // ─── Private: Parse Duration ──────────────────────────────────────

  private _parseDuration(lengthSeconds: string): number {
    const parsed = parseInt(lengthSeconds, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  // ─── Private: Parse Count ──────────────────────────────────────

  private _parseCount(countStr: string): number | undefined {
    if (!countStr || countStr.length === 0) return undefined;
    // Remove commas and spaces (YouTube uses "1,234,567" format)
    const cleaned = countStr.replace(/[,\s]/g, '');
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? undefined : parsed;
  }

  // ─── Private: Height to Quality Label ──────────────────────────────

  private _heightToQuality(height: number): '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | '240p' | 'best' {
    if (height >= 2160) return '2160p';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    if (height >= 240) return '240p';
    return 'best';
  }

  // ─── Private: Build Filename ──────────────────────────────────────

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
