/**
 * TikTok tiktok-api-dl Adapter — Free Provider (Primary)
 *
 * Wraps @tobyg74/tiktok-api-dl's Downloader into the NovaDLProvider interface.
 *
 * This adapter uses NO API keys and NO paid services.
 * It provides triple fallback internally:
 *   V2 (SSSTik.io) → V3 (MusicalDown.com) → V1 (TikTok mobile API)
 *
 * Only the Downloader function is imported. We do NOT import:
 *   - CookieManager (filesystem-dependent)
 *   - DownloadManager (filesystem-dependent)
 *   - TiktokService (JSDOM + filesystem-dependent)
 *   - Signature generator (JSDOM-dependent)
 *   - Search APIs (cookie-dependent)
 *   - User APIs (cookie-dependent)
 *
 * Provider priority in registry:
 *   1. tiktok-api-dl (this adapter — FREE, no keys)
 *   2. tikhub (emergency fallback — paid, quota-limited)
 *   3. rapidapi (emergency fallback — paid)
 */

import { NovaDLProvider, ProviderCapabilities, ProviderHealth } from '../../types';
import { NovaDLResult, NovaDLFormat, NovaDLAudio, NovaDLImage, NovaDLMetadata, NovaDLFormatType, NovaDLImageType } from '../../../types';
import { NovaDLError, NovaDLErrorCode, generateRequestId } from '../../../errors';
import { wrapProviderError } from '../../../provider-utils';
import { formatCount } from '@/lib/format';

// ============================================================================
// TYPE DEFINITIONS FOR tiktok-api-dl RESPONSES
// ============================================================================

/** V1 response (TikTok mobile API) */
interface V1Result {
  status: 'success' | 'error';
  message?: string;
  result?: {
    type: 'video' | 'image' | 'music';
    id?: string;
    createTime?: number;
    desc?: string;
    author?: {
      uid?: string;
      username?: string;
      uniqueId?: string;
      nickname?: string;
      avatarThumb?: string | string[];
      avatarMedium?: string | string[];
      url?: string;
      signature?: string;
      region?: string;
    };
    statistics?: {
      commentCount?: number;
      likeCount?: number;
      shareCount?: number;
      playCount?: number;
      downloadCount?: number;
    };
    video?: {
      ratio?: string;
      duration?: number;
      playAddr?: string[];
      downloadAddr?: string[];
      cover?: string[];
      dynamicCover?: string[];
      originCover?: string[];
    };
    images?: string[];
    music?: {
      id?: number | string;
      title?: string;
      author?: string;
      playUrl?: string[];
      duration?: number;
    };
    hashtag?: string[];
    isADS?: boolean;
    isTurnOffComment?: boolean;
  };
  resultNotParsed?: unknown;
}

/** V2 response (SSSTik.io) */
interface V2Result {
  status: 'success' | 'error';
  message?: string;
  result?: {
    type: 'video' | 'image' | 'music';
    desc?: string;
    author?: {
      avatar?: string;
      nickname?: string;
    };
    statistics?: {
      likeCount?: string;
      commentCount?: string;
      shareCount?: string;
    };
    video?: {
      playAddr?: string[];
    };
    music?: {
      playUrl?: string[];
    };
    images?: string[];
    direct?: string;
  };
}

/** V3 response (MusicalDown.com) */
interface V3Result {
  status: 'success' | 'error';
  message?: string;
  result?: {
    type: 'video' | 'image';
    author?: {
      avatar?: string;
      nickname?: string;
    };
    desc?: string;
    images?: string[];
    videoHD?: string;
    videoSD?: string;
    videoWatermark?: string;
    music?: string;
  };
}

/** Union of all possible results from the Downloader */
type AnyDownloaderResult = V1Result | V2Result | V3Result;

// ============================================================================
// ADAPTER CLASS
// ============================================================================

export class TikTokApiDlAdapter implements NovaDLProvider {
  name = 'tiktok-api-dl';
  platform = 'tiktok';

  async fetchVideo(inputUrl: string): Promise<NovaDLResult> {
    const requestId = generateRequestId();

    try {
      // Dynamic import to avoid loading JSDOM/heavy deps at module level.
      // We only use the Downloader function.
      const tiktokPkg = await import('@tobyg74/tiktok-api-dl');
      const Downloader = tiktokPkg.default?.Downloader || tiktokPkg.Downloader;

      if (!Downloader || typeof Downloader !== 'function') {
        throw new NovaDLError(
          NovaDLErrorCode.PROVIDER_OFFLINE,
          'tiktok-api-dl Downloader not available',
          this.platform,
          requestId,
          { provider: this.name }
        );
      }

      // ──── Internal fallback: V1 ∥ V2 ∥ V3 (parallel race) ────
      // All three versions are tried SIMULTANEOUSLY. Each has a 10-second
      // timeout. We use Promise.allSettled to wait for all to finish, then
      // pick the first successful one (V1 preferred for richest metadata).
      // This eliminates the old sequential V1→V2→V3 which caused 30-45s delays
      // when V1 was slow/blocked and V2/V3 had to wait for V1 to fail first.
      const VERSION_TIMEOUT_MS = 10000;

      const versions: Array<{ version: 'v1' | 'v2' | 'v3'; label: string }> = [
        { version: 'v1', label: 'TikTokAPI' },
        { version: 'v2', label: 'SSSTik' },
        { version: 'v3', label: 'MusicalDown' },
      ];

      type VersionResult = { ok: true; data: any; version: 'v1' | 'v2' | 'v3' } | { ok: false; error: string };

      const allResults = await Promise.allSettled(
        versions.map(({ version, label }) =>
          (async (): Promise<VersionResult> => {
            try {
              console.log(`[tiktok-api-dl] Trying ${label} (${version}) for: ${inputUrl.slice(0, 80)}`);

              // Wrap Downloader call with a timeout to prevent hanging
              const result: any = await Promise.race([
                Downloader(inputUrl, { version }),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error(`${label} timed out after ${VERSION_TIMEOUT_MS}ms`)), VERSION_TIMEOUT_MS)
                ),
              ]);

              if (result?.status === 'success' && result?.result) {
                console.log(`[tiktok-api-dl] ${label} (${version}) succeeded — type: ${result.result.type}`);
                return { ok: true, data: result, version };
              }

              const errMsg = result?.message || `${label} returned status: ${result?.status}`;
              console.warn(`[tiktok-api-dl] ${label} (${version}) failed: ${errMsg}`);
              return { ok: false, error: errMsg };
            } catch (versionError) {
              const msg = versionError instanceof Error ? versionError.message : String(versionError);
              console.warn(`[tiktok-api-dl] ${label} (${version}) threw: ${msg.slice(0, 200)}`);
              return { ok: false, error: msg };
            }
          })()
        )
      );

      // Find the first successful result (prefer V1 for richest data)
      for (let i = 0; i < allResults.length; i++) {
        const r = allResults[i];
        if (r.status === 'fulfilled' && r.value.ok) {
          return this.mapToNovaDLResult(r.value.data, r.value.version, inputUrl);
        }
      }

      // All three versions failed
      const lastError = allResults
        .filter((r): r is PromiseFulfilledResult<VersionResult> => r.status === 'fulfilled' && !r.value.ok)
        .map(r => (r.value as { ok: false; error: string }).error)
        .join('; ') || 'All tiktok-api-dl versions failed';

      throw new NovaDLError(
        NovaDLErrorCode.DOWNLOAD_FAILED,
        lastError,
        this.platform,
        requestId,
        { provider: this.name }
      );
    } catch (error) {
      // If it's already a NovaDLError, throw as-is
      if (error instanceof NovaDLError) throw error;
      // Wrap unknown errors
      throw wrapProviderError(error, this.platform, requestId, this.name);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    // This provider requires NO API keys, so it's always "online"
    // (individual download attempts may still fail due to third-party uptime)
    return {
      status: 'online',
      latency: 0,
      availability: 1.0,
      version: '1.3.8',
      lastCheck: new Date(),
      errorRate: 0,
      successRate: 1,
      retryCount: 0,
    };
  }

  supportedFormats(): string[] {
    return [
      NovaDLFormatType.VIDEO_NO_WATERMARK,
      NovaDLFormatType.VIDEO_WITH_WATERMARK,
      NovaDLFormatType.VIDEO_HD,
      NovaDLFormatType.VIDEO_SD,
    ];
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsVideo: true,
      supportsAudio: true,
      supportsImages: true,
      supportsSlides: true,  // V1, V2, V3 all support slides/images
      supportsStories: false,
      supportsReels: true,
      supportsShorts: true,
      supportsPlaylist: false,
      supportsLive: false,
      supportsCaptions: false,
      supportsMetadata: true,
    };
  }

  // ========================================================================
  // RESULT MAPPING — Maps tiktok-api-dl responses to NovaDLResult
  // ========================================================================

  private mapToNovaDLResult(result: any, version: 'v1' | 'v2' | 'v3', inputUrl?: string): NovaDLResult {
    // Dispatch to version-specific mapper
    switch (version) {
      case 'v1':
        return this.mapV1Result(result);
      case 'v2':
        return this.mapV2Result(result, inputUrl);
      case 'v3':
        return this.mapV3Result(result, inputUrl);
    }
  }

  // ──── V1 Mapper (TikTok mobile API) ────

  private mapV1Result(result: any): NovaDLResult {
    const r = result.result;
    const id = r.id || String(Date.now());
    const title = r.desc || 'TikTok Video';
    const author = r.author?.uniqueId || r.author?.nickname || r.author?.username || '@unknown';

    // Author avatar — V1 returns string arrays
    const authorAvatar = this.firstString(r.author?.avatarThumb) ||
      this.firstString(r.author?.avatarMedium) || '';

    // Thumbnail/cover
    const thumbnail = this.firstString(r.video?.originCover) ||
      this.firstString(r.video?.cover) ||
      this.firstString(r.video?.dynamicCover) || '';

    // Duration — V1 returns duration in milliseconds
    const duration = r.video?.duration
      ? `${Math.floor(r.video.duration / 1000 / 60)}:${String(Math.floor((r.video.duration / 1000) % 60)).padStart(2, '0')}`
      : '0:00';

    // ──── Video formats ────
    const formats: NovaDLFormat[] = [];

    // downloadAddr = no watermark; playAddr = with watermark
    const noWatermarkUrl = this.firstString(r.video?.downloadAddr) || '';
    const withWatermarkUrl = this.firstString(r.video?.playAddr) || '';

    if (noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: noWatermarkUrl,
        quality: '1080p',
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    }

    if (withWatermarkUrl && withWatermarkUrl !== noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_WITH_WATERMARK,
        url: withWatermarkUrl,
        quality: undefined,
        extension: 'mp4',
        label: 'With Watermark',
      });
    }

    // FALLBACK: If no no-watermark URL was found but we have a with-watermark URL,
    // promote the with-watermark URL as the no-watermark download.
    // The V1 TikTok API sometimes returns playAddr but NOT downloadAddr —
    // without this fallback, the "No Watermark HD" button is disabled with no
    // visual indication, and the user can't download at all.
    // The engine bridge does the same (see engine-bridge.ts lines 227–241).
    const hasNoWatermarkV1 = formats.some(f => f.type === NovaDLFormatType.VIDEO_NO_WATERMARK);
    if (!hasNoWatermarkV1 && withWatermarkUrl) {
      formats.unshift({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: withWatermarkUrl,
        quality: undefined,
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    }

    // ──── Audio ────
    const audioUrl = this.firstString(r.music?.playUrl);
    // TikTok V1 API returns AAC audio (m4a), not mp3
    const audioExt = audioUrl.includes('.mp3') ? 'mp3' : 'm4a';
    const audio: NovaDLAudio[] = audioUrl ? [{
      url: audioUrl,
      format: audioExt,
      extension: audioExt,
      label: r.music?.title ? `${r.music.title} (${audioExt.toUpperCase()})` : `${audioExt.toUpperCase()} Audio`,
    }] : [];

    // ──── Images ────
    const images: NovaDLImage[] = [];

    const coverUrl = this.firstString(r.video?.originCover) || this.firstString(r.video?.cover) || '';
    if (coverUrl) {
      images.push({ url: coverUrl, type: NovaDLImageType.COVER, extension: 'jpg', label: 'Cover Image' });
    }

    const dynamicCover = this.firstString(r.video?.dynamicCover);
    if (dynamicCover && dynamicCover !== coverUrl) {
      images.push({ url: dynamicCover, type: NovaDLImageType.THUMBNAIL, extension: 'jpg', label: 'Thumbnail' });
    } else if (thumbnail && thumbnail !== coverUrl) {
      images.push({ url: thumbnail, type: NovaDLImageType.THUMBNAIL, extension: 'jpg', label: 'Thumbnail' });
    }

    // ──── Statistics ────
    const stats = r.statistics;
    const metadata: NovaDLMetadata = {
      videoId: id,
      views: stats?.playCount ? formatCount(stats.playCount) : undefined,
      likes: stats?.likeCount ? formatCount(stats.likeCount) : undefined,
      comments: stats?.commentCount ? formatCount(stats.commentCount) : undefined,
      shares: stats?.shareCount ? formatCount(stats.shareCount) : undefined,
      postType: r.type === 'image' ? 'images' : 'video',
      slideImages: r.type === 'image' && r.images && r.images.length > 0 ? r.images : undefined,
    };

    // ──── Diagnostic ────
    this.logMapping('V1', title, author, noWatermarkUrl, withWatermarkUrl, audioUrl, metadata);

    return {
      success: true,
      message: `Successfully fetched TikTok video from ${this.name} (V1)`,
      platform: this.platform,
      title,
      author,
      authorAvatar,
      thumbnail,
      duration,
      formats,
      audio,
      images,
      metadata,
    };
  }

  // ──── V2 Mapper (SSSTik.io) ────

  private mapV2Result(result: any, inputUrl?: string): NovaDLResult {
    const r = result.result;
    const title = r.desc || 'TikTok Video';
    // V2 only provides nickname (no uniqueId). Try to extract username from URL.
    // If the URL contains @username, use that as the author for filenames.
    const urlUsername = this.extractUsernameFromUrl(inputUrl);
    const author = urlUsername || r.author?.nickname || '@unknown';
    const authorAvatar = r.author?.avatar || '';

    // SSSTik returns video URL directly (no-watermark by default)
    const videoUrl = this.firstString(r.video?.playAddr) || r.direct || '';

    // Thumbnail — V2 (SSSTik) does NOT provide video.cover or video.originCover.
    // The SSSTik page shows the video cover as the author avatar image on the result page,
    // but that's the PROFILE avatar, not the video cover. We cannot get the video cover
    // from V2. Leave empty — the UI will show a proper placeholder (not favicon).
    const thumbnail = this.firstString(r.video?.originCover) ||
      this.firstString(r.video?.cover) || '';

    // Duration — V2 (SSSTik) does NOT provide video.duration.
    // Leave empty string — the UI will hide the duration badge when empty.
    // NEVER show '0:00' unless the video is truly 0 seconds.
    const durationMs = r.video?.duration;
    const duration = durationMs
      ? `${Math.floor(durationMs / 1000 / 60)}:${String(Math.floor((durationMs / 1000) % 60)).padStart(2, '0')}`
      : '';

    // ──── Video formats ────
    const formats: NovaDLFormat[] = [];

    if (videoUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: videoUrl,
        quality: '1080p',
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    }

    // ──── Audio ────
    const audioUrl = this.firstString(r.music?.playUrl);
    // Determine audio extension from URL or default to m4a (TikTok uses AAC)
    const audioExt = audioUrl.includes('.mp3') ? 'mp3' : 'm4a';
    const audio: NovaDLAudio[] = audioUrl ? [{
      url: audioUrl,
      format: audioExt,
      extension: audioExt,
      label: audioExt === 'mp3' ? 'MP3 Audio' : 'M4A Audio',
    }] : [];

    // ──── Images ────
    const images: NovaDLImage[] = [];

    // Cover — use video cover, NEVER author avatar for cover image
    const coverUrl = this.firstString(r.video?.originCover) || this.firstString(r.video?.cover) || '';
    if (coverUrl) {
      images.push({ url: coverUrl, type: NovaDLImageType.COVER, extension: 'jpg', label: 'Cover Image' });
    }

    // ──── Statistics ────
    // SSSTik V2 returns stats as strings — parse them to numbers for formatCount()
    const stats = r.statistics;
    const parseStat = (val: string | number | undefined): number | undefined => {
      if (val === undefined || val === null) return undefined;
      const n = typeof val === 'number' ? val : parseInt(String(val).replace(/[^0-9]/g, ''), 10);
      return isNaN(n) ? undefined : n;
    };
    const metadata: NovaDLMetadata = {
      videoId: String(Date.now()),
      views: parseStat(stats?.playCount) ? formatCount(parseStat(stats?.playCount)!) : undefined,
      likes: parseStat(stats?.likeCount) ? formatCount(parseStat(stats?.likeCount)!) : undefined,
      comments: parseStat(stats?.commentCount) ? formatCount(parseStat(stats?.commentCount)!) : undefined,
      shares: parseStat(stats?.shareCount) ? formatCount(parseStat(stats?.shareCount)!) : undefined,
      postType: r.type === 'image' ? 'images' : r.type === 'music' ? 'video' : 'video',
      slideImages: r.type === 'image' && r.images && r.images.length > 0 ? r.images : undefined,
    };

    this.logMapping('V2', title, author, videoUrl, '', audioUrl, metadata);

    return {
      success: true,
      message: `Successfully fetched TikTok video from ${this.name} (V2)`,
      platform: this.platform,
      title,
      author,
      authorAvatar,
      thumbnail,
      duration,
      formats,
      audio,
      images,
      metadata,
    };
  }

  // ──── V3 Mapper (MusicalDown.com) ────

  private mapV3Result(result: any, inputUrl?: string): NovaDLResult {
    const r = result.result;
    const title = r.desc || 'TikTok Video';
    // V3 only provides nickname (no uniqueId). Try to extract from URL.
    const urlUsername = this.extractUsernameFromUrl(inputUrl);
    const author = urlUsername || r.author?.nickname || '@unknown';
    const authorAvatar = r.author?.avatar || '';
    // V3 (MusicalDown) does NOT provide video cover at all.
    // Leave empty — UI shows proper placeholder, NOT favicon.
    const thumbnail = '';

    // Duration — MusicalDown doesn't provide duration
    const duration = '';

    // ──── Video formats ────
    const formats: NovaDLFormat[] = [];

    // V3 provides the richest video format selection:
    // videoHD, videoSD, videoWatermark
    const noWatermarkUrl = r.videoHD || r.videoSD || '';
    const withWatermarkUrl = r.videoWatermark || '';

    if (r.videoHD) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: r.videoHD,
        quality: '1080p',
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    } else if (r.videoSD) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: r.videoSD,
        quality: '720p',
        extension: 'mp4',
        label: 'No Watermark SD',
      });
    }

    if (withWatermarkUrl && withWatermarkUrl !== noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_WITH_WATERMARK,
        url: withWatermarkUrl,
        quality: undefined,
        extension: 'mp4',
        label: 'With Watermark',
      });
    }

    // FALLBACK: If no no-watermark URL was found but we have a with-watermark URL,
    // promote it as the no-watermark download. Same logic as V1 mapper fallback.
    const hasNoWatermarkV3 = formats.some(f => f.type === NovaDLFormatType.VIDEO_NO_WATERMARK);
    if (!hasNoWatermarkV3 && withWatermarkUrl) {
      formats.unshift({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: withWatermarkUrl,
        quality: undefined,
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    }

    // ──── Audio ────
    const audioUrl = r.music || '';
    // Determine audio extension — MusicalDown typically returns m4a (AAC)
    const audioExt = audioUrl.includes('.mp3') ? 'mp3' : 'm4a';
    const audio: NovaDLAudio[] = audioUrl ? [{
      url: audioUrl,
      format: audioExt,
      extension: audioExt,
      label: audioExt === 'mp3' ? 'MP3 Audio' : 'M4A Audio',
    }] : [];

    // ──── Images ────
    const images: NovaDLImage[] = [];

    // Cover — MusicalDown doesn't provide video cover separately
    // Don't use authorAvatar as cover — that's ISSUE #3

    // ──── Statistics ────
    // MusicalDown doesn't provide statistics
    const metadata: NovaDLMetadata = {
      videoId: String(Date.now()),
      postType: r.type === 'image' ? 'images' : 'video',
      slideImages: r.type === 'image' && r.images && r.images.length > 0 ? r.images : undefined,
    };

    this.logMapping('V3', title, author, noWatermarkUrl, withWatermarkUrl, audioUrl, metadata);

    return {
      success: true,
      message: `Successfully fetched TikTok video from ${this.name} (V3)`,
      platform: this.platform,
      title,
      author,
      authorAvatar,
      thumbnail,
      duration,
      formats,
      audio,
      images,
      metadata,
    };
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  /**
   * Get the first non-empty string from a string array.
   * Handles both string[] and string inputs.
   */
  private firstString(arr: string | string[] | undefined): string {
    if (!arr) return '';
    if (typeof arr === 'string') return arr;
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'string' && item.length > 0) return item;
      }
    }
    return '';
  }

  /**
   * Extract @username from a TikTok URL.
   * TikTok URLs are like: https://www.tiktok.com/@username/video/123...
   * This is used when V2/V3 only return nickname but we need uniqueId for filenames.
   */
  private extractUsernameFromUrl(url: string | undefined): string {
    if (!url) return '';
    // Match /@username/ pattern in TikTok URLs
    const match = url.match(/\/@([a-zA-Z0-9_.]+)\//);
    if (match && match[1]) {
      return `@${match[1]}`;
    }
    return '';
  }

  /**
   * Log mapping diagnostics (same format as TikHub adapter).
   */
  private logMapping(
    version: string,
    title: string,
    author: string,
    noWatermarkUrl: string,
    withWatermarkUrl: string,
    audioUrl: string,
    metadata: NovaDLMetadata
  ): void {
    console.log(`[tiktok-api-dl→NovaDL] version: ${version}`);
    console.log(`[tiktok-api-dl→NovaDL] title: ${title}`);
    console.log(`[tiktok-api-dl→NovaDL] author: ${author}`);
    console.log(`[tiktok-api-dl→NovaDL] noWatermarkUrl: ${noWatermarkUrl ? '✓' : '✗'}`);
    console.log(`[tiktok-api-dl→NovaDL] withWatermarkUrl: ${withWatermarkUrl ? '✓' : '✗'}`);
    console.log(`[tiktok-api-dl→NovaDL] audioUrl: ${audioUrl ? '✓' : '✗'}`);
    console.log(`[tiktok-api-dl→NovaDL] postType: ${metadata.postType || 'video'}`);
    console.log(`[tiktok-api-dl→NovaDL] slideImages: ${metadata.slideImages?.length || 0}`);
  }
}
