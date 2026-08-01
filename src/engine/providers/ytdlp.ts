/**
 * NovaDL Engine — yt-dlp Provider
 * 
 * The most powerful and versatile provider in the engine. yt-dlp
 * supports hundreds of sites and serves as the primary extraction
 * backbone. We wrap it as a subprocess, parse its JSON output,
 * and transform it into our unified ExtractionResult format.
 * 
 * Design decisions:
 * - Subprocess (not Python import) for maximum portability
 * - JSON output mode for structured parsing
 * - Lazy match for broad platform support
 * - Timeout enforcement via process kill
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { v4 as uuid } from 'uuid';
import type {
  Platform,
  ExtractionRequest,
  ExtractionResult,
  ExtractionMetadata,
  MediaItem,
  MediaFormat,
  VideoQuality,
  AudioQuality,
  SubtitleTrack,
  SubtitleFormat,
  CoverImage,
  Thumbnail,
  QualityOption,
  WatermarkInfo,
  ProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderFeature,
} from '../types/index';
import { BaseProvider, ProviderError } from './base';
import { detectPlatform } from '../utils/url';

const execFileAsync = promisify(execFile);

// ─── yt-dlp JSON Output Structure ──────────────────────────────────
// This represents the JSON output from `yt-dlp --dump-json`
// We only parse the fields we need; extra fields are ignored.
interface YtdlpJsonOutput {
  id?: string;
  title?: string;
  description?: string;
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  webpage_url?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  replay_count?: number;
  upload_date?: string;
  categories?: string[];
  tags?: string[];
  live_status?: string;
  age_limit?: number;
  thumbnail?: string;
  thumbnails?: YtdlpThumbnail[];
  formats?: YtdlpFormat[];
  requested_formats?: YtdlpFormat[];
  subtitles?: Record<string, YtdlpSubtitle[]>;
  automatic_captions?: Record<string, YtdlpSubtitle[]>;
  extractor?: string;
  extractor_key?: string;
  playlist?: string;
  playlist_index?: number;
  filename?: string;
  _type?: string;
  width?: number;
  height?: number;
  aspect_ratio?: number;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  container?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  vbr?: number;
  abr?: number;
  resolution?: string;
  format?: string;
  format_id?: string;
  format_note?: string;
  ext?: string;
  url?: string;
  manifest_url?: string;
  http_headers?: Record<string, string>;
  is_live?: boolean;
  was_live?: boolean;
  availability?: string;
}

interface YtdlpFormat {
  format_id?: string;
  format?: string;
  format_note?: string;
  ext?: string;
  url?: string;
  manifest_url?: string;
  width?: number;
  height?: number;
  resolution?: string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  container?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  vbr?: number;
  abr?: number;
  asr?: number;
  http_headers?: Record<string, string>;
  protocol?: string;
  language?: string;
  language_preference?: number;
  quality?: number;
  preference?: number;
}

interface YtdlpThumbnail {
  url?: string;
  width?: number;
  height?: number;
  id?: string;
  preference?: number;
}

interface YtdlpSubtitle {
  url?: string;
  ext?: string;
  name?: string;
  auto_generated?: boolean;
}

// ─── Provider Implementation ─────────────────────────────────────────
export class YtdlpProvider extends BaseProvider {
  readonly id = 'ytdlp';
  readonly name = 'yt-dlp CLI Extractor';
  readonly type: 'cli' = 'cli';

  private _ytdlpPath: string;
  private _timeoutMs: number;

  constructor(config: ProviderConfig) {
    super(config);
    this._ytdlpPath = config.customOptions?.ytdlpPath as string ?? 'yt-dlp';
    this._timeoutMs = config.timeout ?? 120000;
  }

  async initialize(): Promise<void> {
    // Verify yt-dlp is available
    try {
      await execFileAsync(this._ytdlpPath, ['--version'], {
        timeout: 10000,
      });
      
      this._initialized = true;
      this._health = {
        status: 'healthy',
        lastChecked: new Date(),
        consecutiveFailures: 0,
        consecutiveSuccesses: 1,
      };
    } catch (error) {
      throw new ProviderError(
        `yt-dlp not found at path '${this._ytdlpPath}'. Install it or set NOVA_YTDLP_PATH.`,
        this.id,
        'CONFIG_ERROR',
        false,
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const platform = request.platform ?? detectPlatform(request.url);

    try {
      const ytdlpOptions = this._buildYtdlpOptions(request);
      const result = await this.withTimeout(
        this._executeYtdlp(request.url, ytdlpOptions),
        this._timeoutMs,
      );

      const extractionResult = this._transformResult(result, request, platform);
      this.recordSuccess(Date.now() - startTime);
      return extractionResult;
    } catch (error) {
      const latency = Date.now() - startTime;
      const providerError = ProviderError.fromUnknown(this.id, error, platform);
      this.recordFailure(providerError.message, latency);
      throw providerError;
    }
  }

  supports(platform: Platform): boolean {
    // yt-dlp is our universal fallback — it supports virtually everything
    const supportedPlatforms: Platform[] = [
      'youtube', 'youtube_shorts', 'tiktok', 'instagram', 'facebook',
      'x_twitter', 'pinterest', 'reddit', 'vimeo', 'dailymotion',
      'likee', 'bilibili', 'soundcloud', 'snapchat_spotlight', 'threads',
      'linkedin', 'capcut', 'spotify', 'lemon8',
    ];
    return supportedPlatforms.includes(platform);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: [
        'youtube', 'youtube_shorts', 'tiktok', 'instagram', 'facebook',
        'x_twitter', 'pinterest', 'reddit', 'vimeo', 'dailymotion',
        'likee', 'bilibili', 'soundcloud', 'snapchat_spotlight', 'threads',
        'linkedin', 'capcut', 'spotify', 'lemon8',
      ],
      mediaTypes: ['video', 'audio', 'metadata', 'subtitle', 'image'],
      formats: ['mp4', 'webm', 'mp3', 'aac', 'opus', 'flac', 'm4a', 'ogg', 'wav', 'png', 'jpeg', 'srt', 'vtt'],
      qualities: ['best', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '320kbps', '192kbps', '128kbps'],
      features: [
        'video_download', 'audio_download', 'cover_extraction',
        'thumbnail_extraction', 'metadata_extraction', 'subtitle_extraction',
        'streaming', 'multiple_qualities', 'codec_detection',
        'live_stream', 'playlist',
      ] as ProviderFeature[],
      maxConcurrent: 3,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await execFileAsync(this._ytdlpPath, ['--version'], { timeout: 5000 });
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

  // ─── Private: Build yt-dlp CLI Options ──────────────────────────────
  private _buildYtdlpOptions(request: ExtractionRequest): string[] {
    const opts = request.options ?? {};
    const args: string[] = [];

    // Always use JSON dump mode
    args.push('--dump-json');
    args.push('--no-download'); // We only want info, not actual download

    // Suppress warnings and progress
    args.push('--no-warnings');
    args.push('--quiet');

    // Format selection
    if (request.preferredFormat) {
      args.push('--format', this._mapFormatToYtdlp(request.preferredFormat));
    } else if (opts.extractVideo && opts.extractAudio) {
      args.push('--format', 'bestvideo+bestaudio/best');
    } else if (opts.extractAudio && !opts.extractVideo) {
      args.push('--format', 'bestaudio/best');
    } else if (opts.extractVideo) {
      args.push('--format', 'bestvideo+bestaudio/best');
    } else {
      // Default: get all format info
      args.push('--format', 'bestvideo+bestaudio/best');
    }

    // Quality selection
    if (request.preferredQuality) {
      args.push('--format-sort', this._mapQualityToYtdlp(request.preferredQuality));
    }

    // Subtitles
    if (opts.extractSubtitles) {
      if (opts.languages && opts.languages.length > 0) {
        args.push('--write-subs', '--write-auto-subs', '--sub-langs', opts.languages.join(','));
      } else {
        args.push('--write-subs', '--write-auto-subs', '--sub-langs', 'all');
      }
      args.push('--list-subs');
    }

    // Geo/auth (handled via custom options)
    if (this.config.customOptions) {
      const custom = this.config.customOptions;
      if (custom.geoBypassCountry) {
        args.push('--geo-bypass-country', custom.geoBypassCountry as string);
      }
      if (custom.cookiesPath) {
        args.push('--cookies', custom.cookiesPath as string);
      }
      if (custom.proxy) {
        args.push('--proxy', custom.proxy as string);
      }
    }

    // The URL itself (always last)
    args.push(request.url);

    return args;
  }

  // ─── Private: Execute yt-dlp ─────────────────────────────────────────
  private async _executeYtdlp(url: string, args: string[]): Promise<YtdlpJsonOutput> {
    try {
      const { stdout } = await execFileAsync(
        this._ytdlpPath,
        args,
        {
          timeout: this._timeoutMs,
          maxBuffer: 50 * 1024 * 1024, // 50MB for large outputs
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        },
      );

      // yt-dlp may output warnings on stderr but still produce valid JSON on stdout
      if (!stdout || stdout.trim().length === 0) {
        throw new ProviderError(
          `yt-dlp returned empty output for ${url}`,
          this.id,
          'PARSE_ERROR',
          false,
        );
      }

      const parsed = JSON.parse(stdout) as YtdlpJsonOutput;

      // yt-dlp may return a playlist — we only handle single videos in this provider
      if (parsed._type === 'playlist') {
        throw new ProviderError(
          `URL is a playlist, not a single media item. Use playlist endpoint.`,
          this.id,
          'UNSUPPORTED',
          false,
        );
      }

      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ProviderError(
          `Failed to parse yt-dlp JSON output: ${error.message}`,
          this.id,
          'PARSE_ERROR',
          false,
        );
      }

      // Node child_process errors
      if (error && typeof error === 'object' && 'code' in error) {
        const nodeError = error as { code?: string; signal?: string; killed?: boolean };
        if (nodeError.killed) {
          throw new ProviderError(
            `yt-dlp process was killed (timeout or signal: ${nodeError.signal})`,
            this.id,
            'TIMEOUT',
            true,
          );
        }
        if (nodeError.code === 'ENOENT') {
          throw new ProviderError(
            `yt-dlp binary not found at '${this._ytdlpPath}'`,
            this.id,
            'CONFIG_ERROR',
            false,
          );
        }
      }

      throw error;
    }
  }

  // ─── Private: Transform yt-dlp Output → ExtractionResult ────────────
  private _transformResult(
    ytdlp: YtdlpJsonOutput,
    request: ExtractionRequest,
    platform: Platform,
  ): ExtractionResult {
    const opts = request.options ?? {};
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    // Process available formats
    if (ytdlp.formats && ytdlp.formats.length > 0) {
      for (const fmt of ytdlp.formats) {
        const isVideo = fmt.vcodec && fmt.vcodec !== 'none' && fmt.vcodec !== '';
        const isAudio = fmt.acodec && fmt.acodec !== 'none' && fmt.acodec !== '';

        if (isVideo && (opts.extractVideo ?? true)) {
          const videoItem: MediaItem = {
            type: 'video',
            format: (fmt.ext ?? 'mp4') as MediaFormat,
            quality: this._resolutionToQuality(fmt.height),
            url: fmt.url ?? fmt.manifest_url ?? '',
            streamUrl: fmt.manifest_url,
            size: fmt.filesize ?? fmt.filesize_approx,
            duration: ytdlp.duration,
            bitrate: fmt.vbr ?? fmt.tbr,
            codec: {
              video: this._cleanCodec(fmt.vcodec),
              audio: this._cleanCodec(fmt.acodec),
              container: fmt.container ?? fmt.ext,
            },
            resolution: fmt.width && fmt.height ? { width: fmt.width, height: fmt.height } : undefined,
            fps: fmt.fps,
            title: ytdlp.title,
            filename: this._buildFilename(ytdlp, fmt),
            headers: fmt.http_headers,
          };
          mediaItems.push(videoItem);

          qualityOptions.push({
            label: fmt.format_note ?? fmt.format ?? `${fmt.height}p`,
            quality: this._resolutionToQuality(fmt.height),
            format: (fmt.ext ?? 'mp4') as MediaFormat,
            size: fmt.filesize ?? fmt.filesize_approx,
            codec: {
              video: this._cleanCodec(fmt.vcodec),
              audio: this._cleanCodec(fmt.acodec),
            },
            resolution: fmt.width && fmt.height ? { width: fmt.width, height: fmt.height } : undefined,
            bitrate: fmt.vbr ?? fmt.tbr,
            url: fmt.url ?? fmt.manifest_url,
          });
        }

        if (isAudio && !isVideo && (opts.extractAudio ?? false)) {
          const audioItem: MediaItem = {
            type: 'audio',
            format: (fmt.ext ?? 'mp3') as MediaFormat,
            quality: this._bitrateToAudioQuality(fmt.abr),
            url: fmt.url ?? '',
            size: fmt.filesize ?? fmt.filesize_approx,
            duration: ytdlp.duration,
            bitrate: fmt.abr,
            codec: { audio: this._cleanCodec(fmt.acodec) },
            title: ytdlp.title,
            filename: this._buildFilename(ytdlp, fmt),
            headers: fmt.http_headers,
          };
          mediaItems.push(audioItem);
        }
      }
    }

    // If no formats parsed but we have top-level data, create a "best" item
    if (mediaItems.length === 0 && ytdlp.url) {
      mediaItems.push({
        type: 'video',
        format: (ytdlp.ext ?? 'mp4') as MediaFormat,
        quality: 'best',
        url: ytdlp.url,
        duration: ytdlp.duration,
        resolution: ytdlp.width && ytdlp.height ? { width: ytdlp.width, height: ytdlp.height } : undefined,
        codec: {
          video: this._cleanCodec(ytdlp.vcodec),
          audio: this._cleanCodec(ytdlp.acodec),
        },
        title: ytdlp.title,
      });
    }

    // Subtitles
    const subtitles: SubtitleTrack[] = [];
    if (opts.extractSubtitles) {
      const subsData = ytdlp.subtitles ?? {};
      const autoCaps = ytdlp.automatic_captions ?? {};

      for (const [lang, tracks] of Object.entries(subsData)) {
        for (const track of tracks) {
          subtitles.push({
            language: track.name ?? lang,
            languageCode: lang,
            format: (track.ext ?? 'srt') as SubtitleFormat,
            url: track.url,
            autoGenerated: false,
          });
        }
      }

      for (const [lang, tracks] of Object.entries(autoCaps)) {
        for (const track of tracks) {
          // Only add auto captions if manual ones don't exist for this language
          if (!subsData[lang]) {
            subtitles.push({
              language: track.name ?? lang,
              languageCode: lang,
              format: (track.ext ?? 'srt') as SubtitleFormat,
              url: track.url,
              autoGenerated: true,
            });
          }
        }
      }
    }

    // Thumbnails / Covers
    const thumbnails: Thumbnail[] = [];
    const covers: CoverImage[] = [];

    if (opts.extractThumbnail ?? opts.extractCover ?? true) {
      if (ytdlp.thumbnails && ytdlp.thumbnails.length > 0) {
        for (const t of ytdlp.thumbnails) {
          if (t.url) {
            thumbnails.push({
              url: t.url,
              width: t.width,
              height: t.height,
              format: 'jpeg',
            });
          }
        }
        // The highest-preference thumbnail is the cover
        const bestThumb = ytdlp.thumbnails
          .filter((t) => t.url)
          .sort((a, b) => (b.preference ?? 0) - (a.preference ?? 0))[0];
        if (bestThumb?.url) {
          covers.push({
            url: bestThumb.url,
            width: bestThumb.width,
            height: bestThumb.height,
            format: 'jpeg',
          });
        }
      } else if (ytdlp.thumbnail) {
        thumbnails.push({ url: ytdlp.thumbnail, format: 'jpeg' });
        covers.push({ url: ytdlp.thumbnail, format: 'jpeg' });
      }
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: ytdlp.title,
      description: ytdlp.description,
      author: ytdlp.uploader,
      authorId: ytdlp.uploader_id,
      authorUrl: ytdlp.uploader_url,
      platform,
      originalUrl: ytdlp.webpage_url ?? request.url,
      duration: ytdlp.duration,
      viewCount: ytdlp.view_count,
      likeCount: ytdlp.like_count,
      commentCount: ytdlp.comment_count,
      shareCount: ytdlp.replay_count,
      uploadDate: ytdlp.upload_date,
      categories: ytdlp.categories,
      tags: ytdlp.tags,
      isLive: ytdlp.is_live ?? ytdlp.live_status === 'is_live',
      ageRestricted: (ytdlp.age_limit ?? 0) > 0,
      extra: {
        extractor: ytdlp.extractor,
        extractorKey: ytdlp.extractor_key,
        availability: ytdlp.availability,
        aspectRatio: ytdlp.aspect_ratio,
      },
    };

    // Watermark detection hint (yt-dlp doesn't detect watermarks, but we flag
    // known platforms that typically have them)
    const watermarkInfo: WatermarkInfo | undefined = platform === 'tiktok'
      ? { detected: false, removable: true, description: 'TikTok videos may have platform watermark' }
      : undefined;

    // Apply watermark info to video items
    if (watermarkInfo) {
      for (const item of mediaItems) {
        if (item.type === 'video') {
          item.watermark = watermarkInfo;
        }
      }
    }

    return {
      id: uuid(),
      url: request.url,
      platform,
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      subtitles: subtitles.length > 0 ? subtitles : undefined,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: ytdlp,
    };
  }

  // ─── Private: Helper Methods ──────────────────────────────────────────
  private _resolutionToQuality(height?: number): VideoQuality {
    if (!height) return 'best';
    if (height >= 2160) return '2160p';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    if (height >= 240) return '240p';
    return `${height}p`;
  }

  private _bitrateToAudioQuality(abr?: number): AudioQuality {
    if (!abr) return 'best';
    if (abr >= 320) return '320kbps';
    if (abr >= 256) return '256kbps';
    if (abr >= 192) return '192kbps';
    if (abr >= 128) return '128kbps';
    if (abr >= 96) return '96kbps';
    return '64kbps';
  }

  private _cleanCodec(codec?: string): string | undefined {
    if (!codec || codec === 'none') return undefined;
    return codec;
  }

  private _buildFilename(info: YtdlpJsonOutput, fmt?: YtdlpFormat): string {
    const title = info.title ?? 'media';
    const ext = fmt?.ext ?? info.ext ?? 'mp4';
    // Sanitize filename
    const sanitized = title
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 200);
    return `${sanitized}.${ext}`;
  }

  private _mapFormatToYtdlp(format: MediaFormat): string {
    const formatMap: Record<string, string> = {
      mp4: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      webm: 'bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best',
      mp3: 'bestaudio/best',
      aac: 'bestaudio[ext=m4a]/bestaudio/best',
      opus: 'bestaudio[ext=opus]/bestaudio/best',
    };
    return formatMap[format] ?? 'bestvideo+bestaudio/best';
  }

  private _mapQualityToYtdlp(quality: VideoQuality | AudioQuality): string {
    const qualityMap: Record<string, string> = {
      best: '+res,fps,+br',
      worst: '-res,-br',
      '2160p': '+res:2160',
      '1440p': '+res:1440',
      '1080p': '+res:1080',
      '720p': '+res:720',
      '480p': '+res:480',
      '360p': '+res:360',
      '320kbps': '+abr:320',
      '192kbps': '+abr:192',
      '128kbps': '+abr:128',
    };
    return qualityMap[quality] ?? '+res,fps,+br';
  }
}
