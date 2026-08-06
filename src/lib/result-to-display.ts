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
  /** "video" for normal video posts, "images" for photo/slide posts */
  postType?: 'video' | 'images';
  /** For photo/slide posts: array of original image URLs */
  slideImages?: string[];
  /** Additional metadata for richer display */
  comments?: string;
  shares?: string;
  followers?: string;
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

  const videoInfo: VideoInfo = {
    id: result.metadata.videoId || String(Date.now()),
    title: result.title,
    author: result.author,
    avatar: result.authorAvatar || '',
    thumbnail: thumbnail?.url || result.thumbnail,
    duration: result.duration || '',
    views: result.metadata.views || '',
    likes: result.metadata.likes || '',
    noWatermarkUrl: noWatermark?.url || withWatermark?.url || '',
    withWatermarkUrl: withWatermark?.url || '',
    audioUrl: audio?.url || '',
    cover: cover?.url || result.thumbnail,
    postType: result.metadata.postType as 'video' | 'images' | undefined,
    slideImages: result.metadata.slideImages as string[] | undefined,
    comments: (result.metadata.comments as string) || '',
    shares: (result.metadata.shares as string) || '',
    followers: (result.metadata.followers as string) || '',
  };

  // Essential diagnostic: log final VideoInfo summary
  console.log('[VideoInfo] title=%s author=%s thumbnail=%s duration=%s noWm=%s',
    videoInfo.title ? '✓' : '✗',
    videoInfo.author ? '✓' : '✗',
    videoInfo.thumbnail ? '✓' : '✗',
    videoInfo.duration,
    videoInfo.noWatermarkUrl ? '✓' : '✗'
  );

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
  /** NovaDLErrorCode for programmatic error handling on the frontend */
  errorCode?: string;
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
    errorCode: serviceResult.error?.code,
    provider: serviceResult.provider,
    duration: serviceResult.duration,
    requestId: serviceResult.requestId,
  };
}
