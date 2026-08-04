/**
 * DEBUG ENDPOINT: Inspect raw TikHub API response
 *
 * This endpoint calls the TikHub API directly and returns the COMPLETE
 * raw JSON response. It does NOT process the data through the adapter.
 *
 * Usage: POST /api/debug/tikhub-raw { "url": "https://www.tiktok.com/@user/video/123" }
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
      httpStatus: response.status,
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

    // Stage C: extractUrl() on key fields — SAME function as adapter
    function extractUrl(field: unknown): string {
      if (!field) return '';
      if (typeof field === 'string') return field;
      if (typeof field === 'object' && field !== null) {
        const obj = field as Record<string, unknown>;
        if (Array.isArray(obj.url_list) && obj.url_list.length > 0 && typeof obj.url_list[0] === 'string') {
          return obj.url_list[0];
        }
        if (typeof obj.url === 'string') return obj.url;
        if (typeof obj.uri === 'string' && obj.uri.startsWith('http')) return obj.uri;
      }
      return '';
    }

    // Enhanced extractUrl that tries ALL url_list elements (proposed fix)
    function extractUrlRobust(field: unknown): string {
      if (!field) return '';
      if (typeof field === 'string') return field;
      if (typeof field === 'object' && field !== null) {
        const obj = field as Record<string, unknown>;
        // Try ALL elements in url_list, not just [0]
        if (Array.isArray(obj.url_list)) {
          for (const item of obj.url_list) {
            if (typeof item === 'string' && item.length > 0) {
              return item;
            }
          }
        }
        if (typeof obj.url === 'string' && obj.url.length > 0) return obj.url;
        if (typeof obj.uri === 'string' && obj.uri.startsWith('http')) return obj.uri;
        // Try nested data
        if (obj.data && typeof obj.data === 'object') {
          const nested = extractUrlRobust(obj.data);
          if (nested) return nested;
        }
      }
      return '';
    }

    if (videoData) {
      const video = videoData.video as Record<string, unknown> | undefined;

      trace.stageC_videoData = {
        aweme_id: videoData.aweme_id,
        desc: typeof videoData.desc === 'string' ? videoData.desc.slice(0, 100) : String(videoData.desc),
        media_type: videoData.media_type,
        aweme_type: videoData.aweme_type,
        hasVideo: !!videoData.video,
        hasAuthor: !!(videoData.author),
        hasDesc: !!videoData.desc,
        hasTitle: !!videoData.title,
      };

      if (video) {
        // Log the RAW play_addr and download_addr objects — this is the key diagnostic
        trace.stageC_raw_play_addr = video.play_addr;
        trace.stageC_raw_download_addr = video.download_addr;

        trace.stageC_video = {
          play_addr_type: typeof video.play_addr,
          download_addr_type: typeof video.download_addr,
          play_addr_265_type: typeof video.play_addr_265,
          duration: video.duration,
          width: video.width,
          height: video.height,
        };

        // Compare current extractUrl vs robust extractUrl
        const currentPlayUrl = extractUrl(video.play_addr);
        const robustPlayUrl = extractUrlRobust(video.play_addr);
        const currentDownloadUrl = extractUrl(video.download_addr);
        const robustDownloadUrl = extractUrlRobust(video.download_addr);

        trace.stageC_extractUrl_comparison = {
          play_addr_current: currentPlayUrl || '(empty)',
          play_addr_robust: robustPlayUrl || '(empty)',
          play_addr_DIFFERS: currentPlayUrl !== robustPlayUrl,
          download_addr_current: currentDownloadUrl || '(empty)',
          download_addr_robust: robustDownloadUrl || '(empty)',
          download_addr_DIFFERS: currentDownloadUrl !== robustDownloadUrl,
        };

        trace.stageC_extractUrl = {
          play_addr: currentPlayUrl || '(empty)',
          download_addr: currentDownloadUrl || '(empty)',
          play_addr_265: extractUrl(video.play_addr_265) || '(empty)',
        };
      }

      // Music
      const music = videoData.music as Record<string, unknown> | undefined;
      if (music) {
        trace.stageC_music = {
          play_url_type: typeof music.play_url,
          raw_play_url: music.play_url,
          extractUrl_play_url: extractUrl(music.play_url) || '(empty)',
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
          avatar_larger_extractUrl: extractUrl(author.avatar_larger) || '(empty)',
        };
      }

      // Cover
      trace.stageC_cover = {
        cover_type: typeof videoData.cover,
        cover_extractUrl: extractUrl(videoData.cover) || '(empty)',
        origin_cover_type: typeof videoData.origin_cover,
        origin_cover_extractUrl: extractUrl(videoData.origin_cover) || '(empty)',
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

    // Safely stringify the raw data
    const rawDataStr = JSON.stringify(rawJson.data, null, 2);
    const rawDataPreview = typeof rawDataStr === 'string' ? rawDataStr.slice(0, 15000) : 'undefined';

    return NextResponse.json({
      trace,
      rawResponseKeys: Object.keys(rawJson),
      rawDataPreview,
      rawResponseBody: JSON.stringify(rawJson, null, 2).slice(0, 5000),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
