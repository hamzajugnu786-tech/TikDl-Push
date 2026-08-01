/**
 * NovaDL Engine — Tumblr Native Extractor
 *
 * Parses embedded JSON data from Tumblr page source to extract
 * video, image, audio, and multi-image post media URLs with
 * full metadata and author information.
 *
 * Extraction strategies (all real, no mock/demo):
 * 1. Tumblr's `tumblr_api_read` JSON embedded in <script> tags
 * 2. Tumblr's `__tumblr_api_data__` or `window.tumblr` data in page HTML
 * 3. oEmbed endpoint (`https://www.tumblr.com/oembed/1.0?url=...`)
 * 4. Direct parsing of <video> tags for video URL extraction
 * 5. Direct parsing of <img> tags for high-res image URLs from photo posts
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

// ─── Tumblr Embedded Data Types ──────────────────────────────────────

interface TumblrApiReadData {
  tumblelog?: TumblrTumblelogData;
  posts?: TumblrApiReadPost[];
  posts_total?: number;
  post_type?: string;
}

interface TumblrTumblelogData {
  name?: string;
  title?: string;
  description?: string;
  avatar_url?: string;
  url?: string;
}

interface TumblrApiReadPost {
  id?: string;
  url?: string;
  url_with_slug?: string;
  type?: string;
  date?: string;
  slug?: string;
  tumblelog_key?: string;
  regular_title?: string;
  regular_body?: string;
  photo_caption?: string;
  photo_url_1280?: string;
  photo_url_500?: string;
  photo_url_400?: string;
  photo_url_250?: string;
  photo_url_100?: string;
  photos?: TumblrPhotoItem[];
  video_caption?: string;
  video_source?: string;
  video_player?: string;
  video_player_500?: string;
  video_player_250?: string;
  audio_caption?: string;
  audio_url?: string;
  audio_plays?: number;
  dialogue?: TumblrDialogueItem[];
  quote_text?: string;
  quote_source?: string;
  link_url?: string;
  link_text?: string;
  link_description?: string;
  tags?: string[];
  note_count?: number;
  reblog_key?: string;
  reblogged_from_name?: string;
  reblogged_from_url?: string;
  reblogged_root_name?: string;
  reblogged_root_url?: string;
}

interface TumblrPhotoItem {
  caption?: string;
  offsets?: string;
  photo_url_1280?: string;
  photo_url_500?: string;
  photo_url_400?: string;
  photo_url_250?: string;
  photo_url_100?: string;
  width?: number;
  height?: number;
  original_size?: TumblrPhotoSize;
  alt_sizes?: TumblrPhotoSize[];
}

interface TumblrPhotoSize {
  url?: string;
  width?: number;
  height?: number;
}

interface TumblrDialogueItem {
  label?: string;
  phrase?: string;
  name?: string;
}

interface TumblrApiDataPost {
  id?: string;
  reblog_key?: string;
  reblogged_from_id?: string;
  reblogged_from_url?: string;
  reblogged_root_id?: string;
  reblogged_root_url?: string;
  post_url?: string;
  slug?: string;
  type?: string;
  date?: string;
  timestamp?: number;
  tags?: string[];
  blog_name?: string;
  blog?: TumblrBlogInfo;
  note_count?: number;
  title?: string;
  body?: string;
  caption?: string;
  photos?: TumblrApiDataPhoto[];
  player?: string;
  player_list?: TumblrVideoPlayer[];
  audio_url?: string;
  audio_source_url?: string;
  audio_type?: string;
  embed?: string;
  source_url?: string;
  source_title?: string;
  description?: string;
  trail?: TumblrTrailItem[];
}

interface TumblrApiDataPhoto {
  caption?: string;
  original_size?: TumblrPhotoSize;
  alt_sizes?: TumblrPhotoSize[];
  exif?: TumblrExifData;
}

interface TumblrExifData {
  camera?: string;
  iso?: number;
  aperture?: string;
  exposure?: string;
  focal_length?: string;
}

interface TumblrVideoPlayer {
  width?: number;
  embed_code?: string;
}

interface TumblrBlogInfo {
  name?: string;
  avatar?: string;
  url?: string;
  title?: string;
  description?: string;
  uuid?: string;
}

interface TumblrTrailItem {
  blog?: TumblrBlogInfo;
  post?: TumblrTrailPost;
  content?: string;
  content_raw?: string;
}

interface TumblrTrailPost {
  id?: string;
}

interface TumblrOEmbedData {
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
  width?: number;
  height?: number;
  html?: string;
  url?: string;
}

// ─── Provider Implementation ──────────────────────────────────────────

export class TumblrNativeExtractor extends BaseProvider {
  readonly id = 'native_tumblr';
  readonly name = 'Tumblr Native Extractor';
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
        `Tumblr native extractor does not support platform '${platform}'`,
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
    return platform === 'tumblr';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['tumblr'],
      mediaTypes: ['video', 'image', 'audio', 'metadata'],
      formats: ['mp4', 'jpeg', 'png', 'gif', 'webp', 'mp3'],
      qualities: ['best', '1080p', '720p', '480p'],
      features: [
        'video_download', 'image_download', 'audio_download',
        'cover_extraction', 'metadata_extraction', 'multi_image',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://www.tumblr.com', {
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
    const html = await this._fetchPage(url);

    // Strategy 1: tumblr_api_read JSON embedded in <script> tags
    const apiReadData = this._extractTumblrApiRead(html);
    if (apiReadData?.posts?.length) {
      const post = apiReadData.posts[0];
      if (post) {
        return this._buildResultFromApiReadPost(post, apiReadData.tumblelog, url);
      }
    }

    // Strategy 2: __tumblr_api_data__ or window.tumblr data
    const apiDataPost = this._extractTumblrApiData(html);
    if (apiDataPost) {
      return this._buildResultFromApiDataPost(apiDataPost, url);
    }

    // Strategy 3: oEmbed endpoint for metadata and thumbnail
    const oembedResult = await this._fetchOEmbed(url);
    if (oembedResult) {
      // Combine oEmbed data with HTML-extracted media
      const htmlMedia = this._extractMediaFromHtmlTags(html, url);
      if (htmlMedia.media.length > 0) {
        return this._mergeOEmbedWithHtmlMedia(oembedResult, htmlMedia, url);
      }
      // If no HTML tags found, build from oEmbed alone (limited but valid)
      return this._buildResultFromOEmbed(oembedResult, url);
    }

    // Strategy 4+5: Direct parsing of <video> and <img> tags
    const htmlMedia = this._extractMediaFromHtmlTags(html, url);
    if (htmlMedia.media.length > 0) {
      return htmlMedia;
    }

    throw new ProviderError(
      'Could not extract Tumblr media data. No video, image, or audio found.',
      this.id,
      'PARSE_ERROR',
      false,
      'tumblr',
    );
  }

  // ─── Private: Page Fetching ──────────────────────────────────────────

  private async _fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `Tumblr page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'tumblr',
      );
    }

    return response.text();
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────

  private async _fetchOEmbed(url: string): Promise<TumblrOEmbedData | null> {
    try {
      const oembedUrl = `https://www.tumblr.com/oembed/1.0?url=${encodeURIComponent(url)}`;
      const response = await fetch(oembedUrl, {
        headers: {
          'User-Agent': this._userAgent,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as TumblrOEmbedData;
      if (data.type || data.title || data.thumbnail_url) {
        return data;
      }
      return null;
    } catch {
      // oEmbed is optional enrichment — failure is non-critical
      return null;
    }
  }

  // ─── Private: Strategy 1 — tumblr_api_read ──────────────────────────

  private _extractTumblrApiRead(html: string): TumblrApiReadData | null {
    // Pattern: <script>var tumblr_api_read = {...};</script>
    const patterns = [
      /var\s+tumblr_api_read\s*=\s*(\{.*?\});\s*<\/script>/s,
      /tumblr_api_read\s*=\s*(\{.*?\});\s*<\/script>/s,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match?.[1]) {
        try {
          const parsed = JSON.parse(match[1]) as TumblrApiReadData;
          if (parsed.posts || parsed.tumblelog) {
            return parsed;
          }
        } catch {
          // Continue to next pattern
        }
      }
    }
    return null;
  }

  // ─── Private: Strategy 2 — __tumblr_api_data__ / window.tumblr ──────

  private _extractTumblrApiData(html: string): TumblrApiDataPost | null {
    // Pattern A: window.__tumblr_api_data__
    const apiDataPattern = /window\s*\.\s*__tumblr_api_data__\s*=\s*(\{.*?\});\s*<\/script>/s;
    const apiDataMatch = apiDataPattern.exec(html);
    if (apiDataMatch?.[1]) {
      try {
        const parsed = JSON.parse(apiDataMatch[1]) as Record<string, unknown>;
        // The structure may nest posts under various keys
        const post = this._findPostInApiResponse(parsed);
        if (post) return post;
      } catch {
        // Continue
      }
    }

    // Pattern B: window.tumblr = { ... }
    const windowTumblrPattern = /window\s*\.\s*tumblr\s*=\s*(\{.*?\});\s*<\/script>/s;
    const windowTumblrMatch = windowTumblrPattern.exec(html);
    if (windowTumblrMatch?.[1]) {
      try {
        const parsed = JSON.parse(windowTumblrMatch[1]) as Record<string, unknown>;
        const post = this._findPostInApiResponse(parsed);
        if (post) return post;
      } catch {
        // Continue
      }
    }

    // Pattern C: Generic embedded JSON with tumblr post data
    // Tumblr often embeds post data in <script type="application/json"> blocks
    const jsonScriptPattern = /<script[^>]*id="tumblr-assets-data"[^>]*>(.*?)<\/script>/s;
    const jsonScriptMatch = jsonScriptPattern.exec(html);
    if (jsonScriptMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonScriptMatch[1]) as Record<string, unknown>;
        const post = this._findPostInApiResponse(parsed);
        if (post) return post;
      } catch {
        // Continue
      }
    }

    return null;
  }

  private _findPostInApiResponse(data: Record<string, unknown>): TumblrApiDataPost | null {
    // Check common nesting structures for Tumblr API data
    const directPost = data.post as TumblrApiDataPost | undefined;
    if (directPost?.id) return directPost;

    const postsArray = data.posts as TumblrApiDataPost[] | undefined;
    if (Array.isArray(postsArray) && postsArray.length > 0) {
      const firstPost = postsArray[0];
      if (firstPost?.id) return firstPost;
    }

    // Check nested response structures
    const responseObj = data.response as Record<string, unknown> | undefined;
    if (responseObj) {
      const responsePost = responseObj.post as TumblrApiDataPost | undefined;
      if (responsePost?.id) return responsePost;

      const responsePosts = responseObj.posts as TumblrApiDataPost[] | undefined;
      if (Array.isArray(responsePosts) && responsePosts.length > 0) {
        const firstResponsePost = responsePosts[0];
        if (firstResponsePost?.id) return firstResponsePost;
      }
    }

    // Check data-level nesting
    const dataObj = data.data as Record<string, unknown> | undefined;
    if (dataObj) {
      const dataPost = dataObj.post as TumblrApiDataPost | undefined;
      if (dataPost?.id) return dataPost;
    }

    return null;
  }

  // ─── Private: Strategy 4+5 — <video> and <img> tag parsing ──────────

  private _extractMediaFromHtmlTags(html: string, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // Strategy 4: Extract <video> tag sources
    const videoUrls = this._extractVideoTagUrls(html);
    for (const videoUrl of videoUrls) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: videoUrl,
        directUrl: videoUrl,
        title: this._extractMetaContent(html, 'og:title'),
        filename: this._buildFilename(
          this._extractMetaContent(html, 'og:title') ?? 'tumblr_video',
          'mp4',
        ),
      });
    }

    // Strategy 5: Extract <img> tag URLs from photo posts
    // Prioritize high-res images from Tumblr's photo container
    const imageUrls = this._extractImageTagUrls(html);
    for (const imgUrl of imageUrls) {
      const imgFormat = this._urlToFormat(imgUrl);
      mediaItems.push({
        type: 'image',
        format: imgFormat,
        quality: 'best',
        url: imgUrl,
        directUrl: imgUrl,
        title: this._extractMetaContent(html, 'og:title'),
        filename: this._buildFilename(
          this._extractMetaContent(html, 'og:title') ?? 'tumblr_image',
          imgFormat,
        ),
      });
      covers.push({ url: imgUrl, format: this._urlToImageFormat(imgUrl) });
    }

    // Meta tags enrichment for thumbnails
    const ogImage = this._extractMetaContent(html, 'og:image');
    if (ogImage && !imageUrls.includes(ogImage)) {
      thumbnails.push({ url: ogImage, format: this._urlToImageFormat(ogImage) });
    }

    // Extract audio from <audio> tags or audio embed URLs
    const audioUrls = this._extractAudioUrls(html);
    for (const audioUrl of audioUrls) {
      mediaItems.push({
        type: 'audio',
        format: 'mp3',
        quality: 'best',
        url: audioUrl,
        directUrl: audioUrl,
        title: this._extractMetaContent(html, 'og:title'),
        filename: this._buildFilename(
          this._extractMetaContent(html, 'og:title') ?? 'tumblr_audio',
          'mp3',
        ),
      });
    }

    const metadata: ExtractionMetadata = {
      title: this._extractMetaContent(html, 'og:title'),
      description: this._extractMetaContent(html, 'og:description'),
      platform: 'tumblr',
      originalUrl,
      author: this._extractMetaContent(html, 'og:site_name'),
      authorUrl: this._extractCanonicalBlogUrl(html),
      extra: {
        extractionSource: 'html_tags',
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'tumblr',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
    };
  }

  private _extractVideoTagUrls(html: string): string[] {
    const urls: string[] = [];

    // Match <video> tag src attributes
    const videoSrcPattern = /<video[^>]*\ssrc=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = videoSrcPattern.exec(html)) !== null) {
      if (match[1]) urls.push(match[1]);
    }

    // Match <source> tags inside <video> elements
    const sourcePattern = /<source[^>]*\ssrc=["']([^"']+)["'][^>]*type=["']video\/[^"']+["']/gi;
    while ((match = sourcePattern.exec(html)) !== null) {
      if (match[1] && !urls.includes(match[1])) urls.push(match[1]);
    }

    // Match video poster attributes as potential thumbnails
    // (not added to videoUrls but useful for covers later)

    // Match iframe embeds for video providers (YouTube, Vimeo on Tumblr)
    const iframePattern = /<iframe[^>]*\ssrc=["']([^"']*video[^"']*)["']/gi;
    while ((match = iframePattern.exec(html)) !== null) {
      if (match[1] && !urls.includes(match[1])) urls.push(match[1]);
    }

    return urls;
  }

  private _extractImageTagUrls(html: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    // Match images inside Tumblr's photo post containers
    // Tumblr photo posts use specific class patterns
    const photoContainerPattern = /<div[^>]*class=["'][^"']*photo[^"']*["'][^>]*>[\s\S]*?<img[^>]*\ssrc=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = photoContainerPattern.exec(html)) !== null) {
      if (match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        urls.push(match[1]);
      }
    }

    // Match high-res image data attributes Tumblr uses
    const dataHighResPattern = /<img[^>]*data-big-photo=["']([^"']+)["']/gi;
    while ((match = dataHighResPattern.exec(html)) !== null) {
      if (match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        urls.push(match[1]);
      }
    }

    // Match general <img> tags with Tumblr media domains
    const tumblrImgPattern = /<img[^>]*\ssrc=["']([^"']*(?:media\.tumblr\.com|static\.tumblr\.com|64\.media\.tumblr\.com|data\.tumblr\.com)[^"']*)["']/gi;
    while ((match = tumblrImgPattern.exec(html)) !== null) {
      if (match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        urls.push(match[1]);
      }
    }

    // Match og:image meta tag as a reliable high-res source
    const ogImage = this._extractMetaContent(html, 'og:image');
    if (ogImage && !seen.has(ogImage)) {
      seen.add(ogImage);
      urls.push(ogImage);
    }

    return urls;
  }

  private _extractAudioUrls(html: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    // Match <audio> tag sources
    const audioSrcPattern = /<audio[^>]*\ssrc=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = audioSrcPattern.exec(html)) !== null) {
      if (match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        urls.push(match[1]);
      }
    }

    // Match audio source tags
    const audioSourcePattern = /<source[^>]*\ssrc=["']([^"']+)["'][^>]*type=["']audio\/[^"']+["']/gi;
    while ((match = audioSourcePattern.exec(html)) !== null) {
      if (match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        urls.push(match[1]);
      }
    }

    // Match Tumblr audio embed URLs (tumblr_audio_player patterns)
    const audioEmbedPattern = /tumblr_audio_player[^>]*data-audio-url=["']([^"']+)["']/gi;
    while ((match = audioEmbedPattern.exec(html)) !== null) {
      if (match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        urls.push(match[1]);
      }
    }

    // Match audio URLs from Spotify/SoundCloud embeds in Tumblr
    const audioIframePattern = /<iframe[^>]*\ssrc=["']([^"']*(?:spotify\.com|soundcloud\.com)[^"']*)["']/gi;
    while ((match = audioIframePattern.exec(html)) !== null) {
      if (match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        urls.push(match[1]);
      }
    }

    return urls;
  }

  // ─── Private: Build Results ──────────────────────────────────────────

  private _buildResultFromApiReadPost(
    post: TumblrApiReadPost,
    tumblelog: TumblrTumblelogData | undefined,
    originalUrl: string,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];
    const qualityOptions: QualityOption[] = [];

    const postType = post.type ?? '';
    const postTitle = post.regular_title ?? post.slug ?? '';
    const postCaption = post.photo_caption ?? post.video_caption ?? post.audio_caption ?? '';

    // ── Video post extraction ──
    if (postType === 'video') {
      const videoUrl = this._extractVideoUrlFromPlayer(post.video_player ?? '', post.video_player_500 ?? '');
      if (videoUrl) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: videoUrl,
          directUrl: videoUrl,
          title: postTitle || postCaption,
          filename: this._buildFilename(postTitle || postCaption || 'tumblr_video', 'mp4'),
        });

        qualityOptions.push({
          label: 'Best quality',
          quality: 'best',
          format: 'mp4',
          url: videoUrl,
          isSource: true,
        });
      }

      // Video source URL (external video link)
      if (post.video_source) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: post.video_source,
          title: postTitle || postCaption,
        });
      }
    }

    // ── Photo/image post extraction (single and multi) ──
    if (postType === 'photo') {
      if (post.photos && post.photos.length > 0) {
        // Multi-image photo post
        for (const photo of post.photos) {
          const bestUrl = photo.photo_url_1280 ?? photo.original_size?.url ?? photo.photo_url_500 ?? '';
          if (bestUrl) {
            const imgFormat = this._urlToFormat(bestUrl);
            mediaItems.push({
              type: 'image',
              format: imgFormat,
              quality: 'best',
              url: bestUrl,
              directUrl: bestUrl,
              resolution: photo.original_size?.width && photo.original_size?.height
                ? { width: photo.original_size.width, height: photo.original_size.height }
                : undefined,
              title: photo.caption ?? postTitle,
              filename: this._buildFilename(photo.caption ?? postTitle ?? 'tumblr_photo', imgFormat),
            });

            covers.push({
              url: bestUrl,
              width: photo.original_size?.width,
              height: photo.original_size?.height,
              format: this._urlToImageFormat(bestUrl),
            });
          }

          // Alt sizes as thumbnails
          if (photo.alt_sizes) {
            for (const altSize of photo.alt_sizes) {
              if (altSize.url) {
                thumbnails.push({
                  url: altSize.url,
                  width: altSize.width,
                  height: altSize.height,
                  format: this._urlToImageFormat(altSize.url),
                });
              }
            }
          }

          // Legacy alt size fields
          const legacySizes: Array<{ url: string | undefined; width: number | undefined; height: number | undefined }> = [
            { url: photo.photo_url_500, width: 500, height: undefined },
            { url: photo.photo_url_400, width: 400, height: undefined },
            { url: photo.photo_url_250, width: 250, height: undefined },
            { url: photo.photo_url_100, width: 100, height: undefined },
          ];
          for (const size of legacySizes) {
            if (size.url) {
              thumbnails.push({
                url: size.url,
                width: size.width,
                height: size.height,
                format: this._urlToImageFormat(size.url),
              });
            }
          }
        }
      } else {
        // Single image photo post (legacy format)
        const imageUrl = post.photo_url_1280 ?? post.photo_url_500 ?? '';
        if (imageUrl) {
          const imgFormat = this._urlToFormat(imageUrl);
          mediaItems.push({
            type: 'image',
            format: imgFormat,
            quality: 'best',
            url: imageUrl,
            directUrl: imageUrl,
            title: postCaption ?? postTitle,
            filename: this._buildFilename(postCaption ?? postTitle ?? 'tumblr_photo', imgFormat),
          });

          covers.push({ url: imageUrl, format: this._urlToImageFormat(imageUrl) });

          // Add smaller sizes as thumbnails
          const smallerSizes: Array<{ url: string | undefined; w: number }> = [
            { url: post.photo_url_500, w: 500 },
            { url: post.photo_url_400, w: 400 },
            { url: post.photo_url_250, w: 250 },
            { url: post.photo_url_100, w: 100 },
          ];
          for (const size of smallerSizes) {
            if (size.url) {
              thumbnails.push({ url: size.url, width: size.w, format: this._urlToImageFormat(size.url) });
            }
          }
        }
      }
    }

    // ── Audio post extraction ──
    if (postType === 'audio' && post.audio_url) {
      mediaItems.push({
        type: 'audio',
        format: 'mp3',
        quality: 'best',
        url: post.audio_url,
        directUrl: post.audio_url,
        title: postCaption ?? postTitle,
        filename: this._buildFilename(postCaption ?? postTitle ?? 'tumblr_audio', 'mp3'),
      });
    }

    // ── Metadata ──
    const metadata: ExtractionMetadata = {
      title: postTitle,
      description: postCaption ?? post.regular_body,
      author: tumblelog?.name ?? post.reblogged_from_name,
      authorUrl: tumblelog?.url ?? post.reblogged_from_url,
      platform: 'tumblr',
      originalUrl: post.url_with_slug ?? post.url ?? originalUrl,
      likeCount: post.note_count,
      tags: post.tags,
      uploadDate: post.date,
      extra: {
        postId: post.id,
        postType: postType,
        reblogKey: post.reblog_key,
        rebloggedFromName: post.reblogged_from_name,
        rebloggedFromUrl: post.reblogged_from_url,
        rebloggedRootName: post.reblogged_root_name,
        rebloggedRootUrl: post.reblogged_root_url,
        audioPlays: post.audio_plays,
        extractionSource: 'tumblr_api_read',
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'tumblr',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: post,
    };
  }

  private _buildResultFromApiDataPost(
    post: TumblrApiDataPost,
    originalUrl: string,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];
    const qualityOptions: QualityOption[] = [];

    const postType = post.type ?? '';
    const postTitle = post.title ?? post.slug ?? '';
    const postCaption = post.caption ?? post.body ?? post.description ?? '';

    // ── Photo post (single and multi-image) ──
    if (postType === 'photo' && post.photos) {
      for (const photo of post.photos) {
        const bestUrl = photo.original_size?.url ?? '';
        if (bestUrl) {
          const imgFormat = this._urlToFormat(bestUrl);
          mediaItems.push({
            type: 'image',
            format: imgFormat,
            quality: 'best',
            url: bestUrl,
            directUrl: bestUrl,
            resolution: photo.original_size?.width && photo.original_size?.height
              ? { width: photo.original_size.width, height: photo.original_size.height }
              : undefined,
            title: photo.caption ?? postTitle,
            filename: this._buildFilename(photo.caption ?? postTitle ?? 'tumblr_photo', imgFormat),
          });

          covers.push({
            url: bestUrl,
            width: photo.original_size?.width,
            height: photo.original_size?.height,
            format: this._urlToImageFormat(bestUrl),
          });
        }

        // Alt sizes as quality options and thumbnails
        if (photo.alt_sizes) {
          // Sort alt sizes by width descending for quality options
          const sortedSizes = [...photo.alt_sizes].sort(
            (a, b) => (b.width ?? 0) - (a.width ?? 0),
          );

          for (const altSize of sortedSizes) {
            if (altSize.url) {
              const altImgFormat = this._urlToImageFormat(altSize.url);
              thumbnails.push({
                url: altSize.url,
                width: altSize.width,
                height: altSize.height,
                format: altImgFormat,
              });

              qualityOptions.push({
                label: `${altSize.width ?? 0}px`,
                quality: this._widthToImageQuality(altSize.width ?? 0),
                format: altImgFormat,
                url: altSize.url,
                isSource: altSize === photo.original_size,
              });
            }
          }
        }
      }
    }

    // ── Video post ──
    if (postType === 'video') {
      // Extract video URL from embed/player HTML
      if (post.player) {
        const videoUrl = this._extractVideoUrlFromEmbed(post.player);
        if (videoUrl) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: 'best',
            url: videoUrl,
            directUrl: videoUrl,
            title: postTitle || postCaption,
            filename: this._buildFilename(postTitle || postCaption || 'tumblr_video', 'mp4'),
          });

          qualityOptions.push({
            label: 'Best quality',
            quality: 'best',
            format: 'mp4',
            url: videoUrl,
            isSource: true,
          });
        }
      }

      // Check player_list for multiple embed sizes
      if (post.player_list) {
        for (const playerEntry of post.player_list) {
          if (playerEntry.embed_code) {
            const videoUrl = this._extractVideoUrlFromEmbed(playerEntry.embed_code);
            if (videoUrl && !mediaItems.some(m => m.url === videoUrl)) {
              mediaItems.push({
                type: 'video',
                format: 'mp4',
                quality: this._widthToVideoQuality(playerEntry.width ?? 0),
                url: videoUrl,
                directUrl: videoUrl,
                title: postTitle || postCaption,
              });

              qualityOptions.push({
                label: `${playerEntry.width ?? 0}px wide`,
                quality: this._widthToVideoQuality(playerEntry.width ?? 0),
                format: 'mp4',
                url: videoUrl,
              });
            }
          }
        }
      }

      // External video source
      if (post.source_url && !mediaItems.some(m => m.url === post.source_url)) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: post.source_url,
          title: post.source_title ?? postTitle,
        });
      }
    }

    // ── Audio post ──
    if (postType === 'audio' && post.audio_url) {
      mediaItems.push({
        type: 'audio',
        format: this._audioTypeToFormat(post.audio_type ?? ''),
        quality: 'best',
        url: post.audio_url,
        directUrl: post.audio_url,
        title: postTitle || postCaption,
        filename: this._buildFilename(postTitle || postCaption || 'tumblr_audio', this._audioTypeToFormat(post.audio_type ?? '')),
      });
    }

    // ── Text / link / quote post (may have embedded media in body) ──
    if ((postType === 'text' || postType === 'link' || postType === 'quote') && post.body) {
      // Extract any embedded images from body HTML
      const bodyImages = this._extractImageUrlsFromString(post.body);
      for (const imgUrl of bodyImages) {
        const imgFormat = this._urlToFormat(imgUrl);
        mediaItems.push({
          type: 'image',
          format: imgFormat,
          quality: 'best',
          url: imgUrl,
          directUrl: imgUrl,
          title: postTitle,
          filename: this._buildFilename(postTitle ?? 'tumblr_embed', imgFormat),
        });
      }

      // Extract any embedded videos from body HTML
      const bodyVideos = this._extractVideoUrlsFromString(post.body);
      for (const vidUrl of bodyVideos) {
        if (!mediaItems.some(m => m.url === vidUrl)) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: 'best',
            url: vidUrl,
            title: postTitle,
          });
        }
      }
    }

    // ── Reblog trail (original author info) ──
    const trailAuthor = post.trail?.[0]?.blog;

    // ── Metadata ──
    const metadata: ExtractionMetadata = {
      title: postTitle,
      description: postCaption,
      author: post.blog_name ?? trailAuthor?.name,
      authorId: post.blog?.uuid ?? trailAuthor?.uuid,
      authorUrl: post.blog?.url ?? trailAuthor?.url,
      platform: 'tumblr',
      originalUrl: post.post_url ?? originalUrl,
      likeCount: post.note_count,
      tags: post.tags,
      uploadDate: post.date ?? (post.timestamp ? new Date(post.timestamp * 1000).toISOString() : undefined),
      extra: {
        postId: post.id,
        postType: postType,
        reblogKey: post.reblog_key,
        rebloggedFromId: post.reblogged_from_id,
        rebloggedFromUrl: post.reblogged_from_url,
        rebloggedRootId: post.reblogged_root_id,
        rebloggedRootUrl: post.reblogged_root_url,
        sourceUrl: post.source_url,
        sourceTitle: post.source_title,
        audioSourceUrl: post.audio_source_url,
        extractionSource: 'tumblr_api_data',
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'tumblr',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: post,
    };
  }

  private _buildResultFromOEmbed(
    oembed: TumblrOEmbedData,
    originalUrl: string,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // oEmbed for video posts provides thumbnail, sometimes HTML embed
    if (oembed.type === 'video' && oembed.html) {
      const videoUrl = this._extractVideoUrlFromEmbed(oembed.html);
      if (videoUrl) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: videoUrl,
          title: oembed.title,
          filename: this._buildFilename(oembed.title ?? 'tumblr_video', 'mp4'),
        });
      }
    }

    // oEmbed thumbnail as cover/image
    if (oembed.thumbnail_url) {
      const thumbFormat = this._urlToImageFormat(oembed.thumbnail_url);
      if (oembed.type === 'photo') {
        mediaItems.push({
          type: 'image',
          format: thumbFormat,
          quality: 'best',
          url: oembed.thumbnail_url,
          directUrl: oembed.thumbnail_url,
          resolution: oembed.thumbnail_width && oembed.thumbnail_height
            ? { width: oembed.thumbnail_width, height: oembed.thumbnail_height }
            : undefined,
          title: oembed.title,
          filename: this._buildFilename(oembed.title ?? 'tumblr_image', thumbFormat),
        });
      }

      covers.push({
        url: oembed.thumbnail_url,
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height,
        format: thumbFormat,
      });

      thumbnails.push({
        url: oembed.thumbnail_url,
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height,
        format: thumbFormat,
      });
    }

    const metadata: ExtractionMetadata = {
      title: oembed.title,
      author: oembed.author_name,
      authorUrl: oembed.author_url,
      platform: 'tumblr',
      originalUrl: oembed.url ?? originalUrl,
      extra: {
        oembedType: oembed.type,
        oembedProvider: oembed.provider_name,
        oembedWidth: oembed.width,
        oembedHeight: oembed.height,
        extractionSource: 'oembed',
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'tumblr',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: oembed,
    };
  }

  private _mergeOEmbedWithHtmlMedia(
    oembed: TumblrOEmbedData,
    htmlResult: ExtractionResult,
    _originalUrl: string,
  ): ExtractionResult {
    // Enrich HTML-extracted media with oEmbed metadata
    const enrichedMetadata: ExtractionMetadata = {
      ...htmlResult.metadata,
      title: htmlResult.metadata.title ?? oembed.title,
      author: htmlResult.metadata.author ?? oembed.author_name,
      authorUrl: htmlResult.metadata.authorUrl ?? oembed.author_url,
      extra: {
        ...htmlResult.metadata.extra,
        oembedType: oembed.type,
        oembedProvider: oembed.provider_name,
        extractionSource: 'oembed_and_html_tags',
      },
    };

    // Add oEmbed thumbnail if not already present
    const oembedThumbs: Thumbnail[] = [];
    if (oembed.thumbnail_url) {
      const alreadyHasThumb = htmlResult.thumbnails?.some(t => t.url === oembed.thumbnail_url) ?? false;
      if (!alreadyHasThumb) {
        oembedThumbs.push({
          url: oembed.thumbnail_url,
          width: oembed.thumbnail_width,
          height: oembed.thumbnail_height,
          format: this._urlToImageFormat(oembed.thumbnail_url),
        });
      }
    }

    const mergedThumbnails = [...(htmlResult.thumbnails ?? []), ...oembedThumbs];

    // Add oEmbed cover if not already present
    const oembedCovers: CoverImage[] = [];
    if (oembed.thumbnail_url) {
      const alreadyHasCover = htmlResult.covers?.some(c => c.url === oembed.thumbnail_url) ?? false;
      if (!alreadyHasCover) {
        oembedCovers.push({
          url: oembed.thumbnail_url,
          width: oembed.thumbnail_width,
          height: oembed.thumbnail_height,
          format: this._urlToImageFormat(oembed.thumbnail_url),
        });
      }
    }

    const mergedCovers = [...(htmlResult.covers ?? []), ...oembedCovers];

    return {
      ...htmlResult,
      metadata: enrichedMetadata,
      covers: mergedCovers.length > 0 ? mergedCovers : undefined,
      thumbnails: mergedThumbnails.length > 0 ? mergedThumbnails : undefined,
      rawResponse: { htmlMedia: htmlResult.rawResponse, oembed },
    };
  }

  // ─── Private: Video URL Extraction Helpers ──────────────────────────

  private _extractVideoUrlFromPlayer(playerHtml: string, player500Html: string): string | undefined {
    // Try the 500-width player first (often has better embed data)
    const url = this._extractVideoUrlFromEmbed(player500Html || playerHtml);
    return url;
  }

  private _extractVideoUrlFromEmbed(embedHtml: string): string | undefined {
    // Extract video URL from Tumblr's video embed HTML
    // Tumblr wraps external videos in iframe embeds or provides direct URLs

    // Pattern 1: Direct video src in iframe
    const iframeSrcPattern = /<iframe[^>]*\ssrc=["']([^"']+)["']/i;
    const iframeMatch = iframeSrcPattern.exec(embedHtml);
    if (iframeMatch?.[1]) return iframeMatch[1];

    // Pattern 2: Video source tag
    const sourcePattern = /<source[^>]*\ssrc=["']([^"']+)["']/i;
    const sourceMatch = sourcePattern.exec(embedHtml);
    if (sourceMatch?.[1]) return sourceMatch[1];

    // Pattern 3: Direct video src attribute
    const videoSrcPattern = /<video[^>]*\ssrc=["']([^"']+)["']/i;
    const videoMatch = videoSrcPattern.exec(embedHtml);
    if (videoMatch?.[1]) return videoMatch[1];

    // Pattern 4: Tumblr video URL pattern in data attributes
    const dataVideoPattern = /data-video-url=["']([^"']+)["']/i;
    const dataMatch = dataVideoPattern.exec(embedHtml);
    if (dataMatch?.[1]) return dataMatch[1];

    // Pattern 5: HD video URL
    const hdPattern = /data-hd-video=["']([^"']+)["']/i;
    const hdMatch = hdPattern.exec(embedHtml);
    if (hdMatch?.[1]) return hdMatch[1];

    return undefined;
  }

  private _extractVideoUrlsFromString(htmlString: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    // iframe video embeds
    const iframePattern = /<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*(?:video|embed)/gi;
    let match: RegExpExecArray | null;
    while ((match = iframePattern.exec(htmlString)) !== null) {
      if (match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        urls.push(match[1]);
      }
    }

    // video/source tags
    const videoPatterns = [
      /<video[^>]*\ssrc=["']([^"']+)["']/gi,
      /<source[^>]*\ssrc=["']([^"']+)["']/gi,
    ];
    for (const pattern of videoPatterns) {
      while ((match = pattern.exec(htmlString)) !== null) {
        if (match[1] && !seen.has(match[1])) {
          seen.add(match[1]);
          urls.push(match[1]);
        }
      }
    }

    return urls;
  }

  private _extractImageUrlsFromString(htmlString: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    const imgPattern = /<img[^>]*\ssrc=["']([^"']*(?:media\.tumblr\.com|static\.tumblr\.com|64\.media\.tumblr\.com)[^"']*)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = imgPattern.exec(htmlString)) !== null) {
      if (match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        urls.push(match[1]);
      }
    }

    return urls;
  }

  // ─── Private: Meta Content Extraction ──────────────────────────────────

  private _extractMetaContent(html: string, property: string): string | undefined {
    // Match both property and name attributes for meta tags
    const propertyPattern = new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
    const propertyMatch = propertyPattern.exec(html);
    if (propertyMatch?.[1]) return propertyMatch[1];

    const namePattern = new RegExp(`<meta\\s+name=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
    const nameMatch = namePattern.exec(html);
    if (nameMatch?.[1]) return nameMatch[1];

    return undefined;
  }

  private _extractCanonicalBlogUrl(html: string): string | undefined {
    const canonicalPattern = /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i;
    const match = canonicalPattern.exec(html);
    return match?.[1];
  }

  // ─── Private: Format & Quality Helpers ──────────────────────────────────

  private _urlToFormat(url: string): 'jpeg' | 'png' | 'gif' | 'webp' | 'mp4' | 'mp3' {
    const lower = url.toLowerCase();
    if (lower.includes('.png')) return 'png';
    if (lower.includes('.gif')) return 'gif';
    if (lower.includes('.webp')) return 'webp';
    if (lower.includes('.mp4')) return 'mp4';
    if (lower.includes('.mp3')) return 'mp3';
    return 'jpeg'; // Tumblr default for photos
  }

  /** Resolve URL to an ImageFormat for covers/thumbnails.
   *  Falls back to 'jpeg' for non-image URLs (video/audio thumb URLs). */
  private _urlToImageFormat(url: string): 'jpeg' | 'png' | 'gif' | 'webp' {
    const lower = url.toLowerCase();
    if (lower.includes('.png')) return 'png';
    if (lower.includes('.gif')) return 'gif';
    if (lower.includes('.webp')) return 'webp';
    return 'jpeg';
  }

  private _audioTypeToFormat(audioType: string): 'mp3' | 'ogg' | 'wav' {
    const lower = audioType.toLowerCase();
    if (lower.includes('ogg')) return 'ogg';
    if (lower.includes('wav')) return 'wav';
    return 'mp3';
  }

  private _widthToImageQuality(width: number): '1080p' | '720p' | '480p' | '360p' {
    if (width >= 1080) return '1080p';
    if (width >= 720) return '720p';
    if (width >= 480) return '480p';
    return '360p';
  }

  private _widthToVideoQuality(width: number): '1080p' | '720p' | '480p' | '360p' {
    if (width >= 1080) return '1080p';
    if (width >= 720) return '720p';
    if (width >= 480) return '480p';
    return '360p';
  }

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
