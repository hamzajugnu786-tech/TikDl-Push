/**
 * DEBUG ENDPOINT: Inspect raw TikHub API response
 *
 * This endpoint calls the TikHub API directly and returns the COMPLETE
 * raw JSON response. It does NOT process the data through the adapter.
 *
 * Usage: POST /api/debug/tikhub-raw { "url": "https://www.tiktok.com/@user/video/123" }
 *
 * SECURITY: This endpoint is only available in development mode.
 * In production, it requires the same admin authentication as other admin routes.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const apiKey = process.env.TIKHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'TIKHUB_API_KEY not set in environment' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    // Call TikHub API directly — same endpoint as the adapter
    const tikhubUrl = `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video_by_share_url?share_url=${encodeURIComponent(url)}`;

    const response = await fetch(tikhubUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    const rawJson = await response.json();

    // Trace the adapter pipeline step by step
    const trace: Record<string, unknown> = {};

    // Stage A: Raw TikHub JSON
    trace.stageA_rawResponse = {
      code: rawJson.code,
      message: rawJson.message,
      dataType: typeof rawJson.data,
      dataIsArray: Array.isArray(rawJson.data),
      dataKeys: rawJson.data && typeof rawJson.data === 'object' ? Object.keys(rawJson.data) : null,
    };

    // Stage B: Response unwrapping (same logic as adapter)
    const rawData = rawJson.data;
    let videoData: Record<string, unknown> | null = null;

    if (rawData && typeof rawData === 'object') {
      if (rawData.aweme_detail && typeof rawData.aweme_detail === 'object') {
        videoData = rawData.aweme_detail as Record<string, unknown>;
        trace.stageB_unwrapping = 'result.data.aweme_detail';
      } else if (rawData.aweme_id || rawData.desc || rawData.author || rawData.video) {
        videoData = rawData as Record<string, unknown>;
        trace.stageB_unwrapping = 'result.data directly';
      } else if (rawData.data && typeof rawData.data === 'object') {
        videoData = rawData.data as Record<string, unknown>;
        trace.stageB_unwrapping = 'result.data.data';
      }
    }

    if (!videoData) {
      videoData = rawJson.videoData || rawJson.data || rawJson;
      trace.stageB_unwrapping = 'fallback';
    }

    // Stage C: extractUrl() on key fields
    function extractUrl(field: unknown): string {
      if (!field) return '';
      if (typeof field === 'string') return field;
      if (typeof field === 'object' && field !== null) {
        const obj = field as Record<string, unknown>;
        if (Array.isArray(obj.url_list) && obj.url_list.length > 0 && typeof obj.url_list[0] === 'string') {
          return obj.url_list[0];
        }
        if (typeof obj.url === 'string') return obj.url;
      }
      return '';
    }

    if (videoData) {
      const video = videoData.video as Record<string, unknown> | undefined;

      trace.stageC_videoData = {
        aweme_id: videoData.aweme_id,
        desc: typeof videoData.desc === 'string' ? videoData.desc.slice(0, 100) : videoData.desc,
        media_type: videoData.media_type,
        aweme_type: videoData.aweme_type,
        hasVideo: !!videoData.video,
        hasAuthor: !!(videoData.author),
        hasDesc: !!videoData.desc,
        hasTitle: !!videoData.title,
      };

      if (video) {
        trace.stageC_video = {
          play_addr_type: typeof video.play_addr,
          play_addr_value: video.play_addr,
          download_addr_type: typeof video.download_addr,
          download_addr_value: video.download_addr,
          play_addr_265_type: typeof video.play_addr_265,
          duration: video.duration,
          width: video.width,
          height: video.height,
        };

        trace.stageC_extractUrl = {
          play_addr: extractUrl(video.play_addr),
          download_addr: extractUrl(video.download_addr),
          play_addr_265: extractUrl(video.play_addr_265),
        };
      }

      // Music
      const music = videoData.music as Record<string, unknown> | undefined;
      if (music) {
        trace.stageC_music = {
          play_url_type: typeof music.play_url,
          play_url_value: music.play_url,
          extractUrl_play_url: extractUrl(music.play_url),
        };
      }

      // Images
      const imagePostInfo = videoData.image_post_info as Record<string, unknown> | undefined;
      const imageList = videoData.image_list;
      trace.stageC_images = {
        image_post_info: imagePostInfo ? {
          imagesCount: Array.isArray(imagePostInfo?.images) ? imagePostInfo.images.length : 0,
        } : null,
        image_list: Array.isArray(imageList) ? imageList.length : 0,
      };

      // Author
      const author = videoData.author as Record<string, unknown> | undefined;
      if (author) {
        trace.stageC_author = {
          unique_id: author.unique_id,
          nickname: author.nickname,
          avatar_larger_type: typeof author.avatar_larger,
          avatar_larger_extractUrl: extractUrl(author.avatar_larger),
        };
      }

      // Cover
      trace.stageC_cover = {
        cover_type: typeof videoData.cover,
        cover_extractUrl: extractUrl(videoData.cover),
        origin_cover_type: typeof videoData.origin_cover,
        origin_cover_extractUrl: extractUrl(videoData.origin_cover),
      };
    }

    // Stage D: Unavailable detection (same logic as adapter)
    if (videoData) {
      const hasVideoSection = !!videoData.video;
      const hasImages = (videoData.image_post_info && typeof videoData.image_post_info === 'object' &&
        Array.isArray((videoData.image_post_info as Record<string, unknown>).images) &&
        ((videoData.image_post_info as Record<string, unknown>).images as unknown[]).length > 0) ||
        (Array.isArray(videoData.image_list) && videoData.image_list.length > 0);
      const author = videoData.author as Record<string, unknown> | undefined;
      const hasAuthor = author && (author.unique_id || author.nickname);
      const hasTitle = videoData.desc || videoData.title;

      trace.stageD_unavailableCheck = {
        hasVideoSection,
        hasImages,
        hasAuthor: !!hasAuthor,
        hasTitle: !!hasTitle,
        preExtractionTrigger: !hasVideoSection && !hasImages && !hasAuthor && !hasTitle,
      };

      // Post-extraction check
      const video = videoData.video as Record<string, unknown> | undefined;
      const noWatermarkUrl = (video ? extractUrl(video.download_addr) || extractUrl(video.play_addr) : '');
      const music = videoData.music as Record<string, unknown> | undefined;
      const audioUrl = music ? extractUrl(music.play_url) : '';
      const formatsCount = noWatermarkUrl ? 1 : 0;
      const audioCount = audioUrl ? 1 : 0;

      trace.stageD_postExtractionCheck = {
        noWatermarkUrl: noWatermarkUrl ? noWatermarkUrl.slice(0, 100) : '(empty)',
        audioUrl: audioUrl ? audioUrl.slice(0, 100) : '(empty)',
        formatsCount,
        audioCount,
        hasAnyDownload: formatsCount > 0 || audioCount > 0,
        postExtractionTrigger: formatsCount === 0 && audioCount === 0,
      };
    }

    return NextResponse.json({
      trace,
      rawResponseKeys: Object.keys(rawJson),
      // Include the raw data field (truncated for safety)
      rawDataPreview: JSON.stringify(rawJson.data, null, 2).slice(0, 10000),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
