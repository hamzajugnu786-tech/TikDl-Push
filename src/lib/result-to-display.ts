/**
 * NovaDL Result Mapper — Phase 1
 *
 * Converts NovaDLResult (unified format) into the VideoInfo shape
 * that the TikDL frontend expects. This ensures ZERO UI modifications.
 *
 * The frontend currently uses this VideoInfo interface (from page.tsx):
 *
 *   interface VideoInfo {
 *     id: string;
 *     title: string;
 *     author: string;
 *     avatar: string;
 *     thumbnail: string;
 *     duration: string;
 *     views: string;
 *     likes: string;
 *     noWatermarkUrl: string;
 *     withWatermarkUrl: string;
 *     audioUrl: string;
 *     cover: string;
 *   }
 *
 * This mapper extracts the familiar fields from NovaDLResult:
 *   - formats[type="video_no_watermark"] → noWatermarkUrl
 *   - formats[type="video_with_watermark"] → withWatermarkUrl
 *   - audio[0] → audioUrl
 *   - images[type="cover"] → cover
 *
 * The TikDL UI must continue receiving exactly the same data it expects today.
 * Zero UI modifications.
 */

import { NovaDLResult, NovaDLFormatType, NovaDLImageType } from '../services/types';

// ============================================================================
// VIDEO INFO TYPE (matches the frontend interface in page.tsx)
// ============================================================================

export interface VideoInfo {
  id: string;
  title: string;
  author: string;
  avatar: string;
  thumbnail: string;
  duration: string;
  views: string;
  likes: string;
  noWatermarkUrl: string;
  withWatermarkUrl: string;
  audioUrl: string;
  cover: string;
}

// ============================================================================
// RESULT MAPPER FUNCTION
// ============================================================================

/**
 * Convert NovaDLResult into VideoInfo for the frontend.
 *
 * For TikTok results:
 *   - noWatermarkUrl → formats[type="video_no_watermark"].url
 *   - withWatermarkUrl → formats[type="video_with_watermark"].url
 *   - audioUrl → audio[0].url
 *   - cover → images[type="cover"].url
 *
 * For future platforms (Instagram, YouTube, etc.):
 *   The frontend will be updated in Phase 2 to use NovaDLResult directly.
 *   But in Phase 1, this mapper ensures backward compatibility.
 */
export function adaptResultForDisplay(result: NovaDLResult): VideoInfo {
  // Extract familiar fields from NovaDLResult
  const noWatermark = result.formats.find(f => f.type === NovaDLFormatType.VIDEO_NO_WATERMARK);
  const withWatermark = result.formats.find(f => f.type === NovaDLFormatType.VIDEO_WITH_WATERMARK);
  const audio = result.audio[0];
  const cover = result.images.find(i => i.type === NovaDLImageType.COVER);
  const thumbnail = result.images.find(i => i.type === NovaDLImageType.THUMBNAIL);

  // ──── STAGE C: VideoInfo after mapping ────
  console.log('[TRACE-C] adaptResultForDisplay input:');
  console.log('[TRACE-C]   result.title:', result.title);
  console.log('[TRACE-C]   result.author:', result.author);
  console.log('[TRACE-C]   result.authorAvatar:', result.authorAvatar || '(undefined)');
  console.log('[TRACE-C]   result.thumbnail:', result.thumbnail ? result.thumbnail.slice(0, 80) : '(empty)');
  console.log('[TRACE-C]   result.duration:', result.duration);
  console.log('[TRACE-C]   result.formats:', result.formats.map(f => `${f.type}=${f.url.slice(0, 60)}`));
  console.log('[TRACE-C]   result.audio:', result.audio.map(a => `url=${a.url.slice(0, 60)}`));
  console.log('[TRACE-C]   result.images:', result.images.map(i => `${i.type}=${i.url.slice(0, 60)}`));
  console.log('[TRACE-C]   result.metadata:', JSON.stringify(result.metadata));
  console.log('[TRACE-C]   noWatermark found:', !!noWatermark, 'url:', noWatermark?.url?.slice(0, 80));
  console.log('[TRACE-C]   withWatermark found:', !!withWatermark, 'url:', withWatermark?.url?.slice(0, 80));
  console.log('[TRACE-C]   audio found:', !!audio, 'url:', audio?.url?.slice(0, 80));
  console.log('[TRACE-C]   cover found:', !!cover, 'url:', cover?.url?.slice(0, 80));
  console.log('[TRACE-C]   thumbnail found:', !!thumbnail, 'url:', thumbnail?.url?.slice(0, 80));

  const videoInfo: VideoInfo = {
    id: result.metadata.videoId || String(Date.now()),
    title: result.title,
    author: result.author,
    avatar: result.authorAvatar || '',
    thumbnail: thumbnail?.url || result.thumbnail,
    duration: result.duration || '0:00',
    views: result.metadata.views || '',
    likes: result.metadata.likes || '',
    noWatermarkUrl: noWatermark?.url || '',
    withWatermarkUrl: withWatermark?.url || '',
    audioUrl: audio?.url || '',
    cover: cover?.url || result.thumbnail,
  };

  // ──── STAGE C: Final VideoInfo ────
  console.log('[TRACE-C] VideoInfo output:', JSON.stringify({
    id: videoInfo.id,
    title: videoInfo.title,
    author: videoInfo.author,
    avatar: videoInfo.avatar ? videoInfo.avatar.slice(0, 80) : '(empty)',
    thumbnail: videoInfo.thumbnail ? videoInfo.thumbnail.slice(0, 80) : '(empty)',
    duration: videoInfo.duration,
    views: videoInfo.views,
    likes: videoInfo.likes,
    noWatermarkUrl: videoInfo.noWatermarkUrl ? videoInfo.noWatermarkUrl.slice(0, 80) : '(empty)',
    withWatermarkUrl: videoInfo.withWatermarkUrl ? videoInfo.withWatermarkUrl.slice(0, 80) : '(empty)',
    audioUrl: videoInfo.audioUrl ? videoInfo.audioUrl.slice(0, 80) : '(empty)',
    cover: videoInfo.cover ? videoInfo.cover.slice(0, 80) : '(empty)',
  }));

  return videoInfo;
}

// ============================================================================
// API RESPONSE FORMAT (matches what the frontend expects)
// ============================================================================

/**
 * The API response shape that the frontend expects from /api/download.
 *
 *   { success: boolean, data: VideoInfo, provider: string, duration: number }
 *
 * This is produced by converting ServiceResult (from DownloadService)
 * into this format using adaptResultForDisplay().
 */
export interface DownloadApiResponse {
  success: boolean;
  data?: VideoInfo;
  error?: string;
  provider?: string;
  duration?: number;
  requestId?: string;
}

/**
 * Convert ServiceResult into the frontend-expected DownloadApiResponse.
 *
 * On success: { success: true, data: VideoInfo, provider, duration }
 * On error:   { success: false, error: errorMessage }
 */
export function serviceResultToApiResponse(
  serviceResult: import('../services/types').ServiceResult
): DownloadApiResponse {
  if (serviceResult.success && serviceResult.data) {
    const videoInfo = adaptResultForDisplay(serviceResult.data);
    return {
      success: true,
      data: videoInfo,
      provider: serviceResult.provider,
      duration: serviceResult.duration,
      requestId: serviceResult.requestId,
    };
  }

  // Error case
  return {
    success: false,
    error: serviceResult.error?.message || 'Download failed',
    provider: serviceResult.provider,
    duration: serviceResult.duration,
    requestId: serviceResult.requestId,
  };
}
