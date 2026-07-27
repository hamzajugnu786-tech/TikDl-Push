/**
 * NovaDL Provider Interface — Phase 1 Core Interfaces
 *
 * The contract every download provider must implement.
 * Whether for TikTok, Instagram, YouTube, Facebook, or any future
 * platform — all providers implement this same interface.
 */

import { NovaDLResult } from '../types';
import { NovaDLError } from '../errors';

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

export interface NovaDLProvider {
  /** Unique identifier for this provider (e.g. "tikhub", "rapidapi", "yt-dlp") */
  name: string;

  /** Platform this provider serves (e.g. "tiktok", "instagram", "youtube") */
  platform: string;

  /** Fetch video/content metadata and download URLs from the provider */
  fetchVideo(url: string): Promise<NovaDLResult>;

  /** Check if this provider is currently operational */
  healthCheck(): Promise<ProviderHealth>;

  /** List of download formats this provider can return */
  supportedFormats(): NovaDLFormatTypeValue[];

  /** Provider capabilities — what types of content this provider supports */
  capabilities(): ProviderCapabilities;
}

// ============================================================================
// PROVIDER HEALTH
// ============================================================================

export interface ProviderHealth {
  /** Current operational status */
  status: 'online' | 'offline' | 'degraded';

  /** Average response latency in milliseconds */
  latency: number;

  /** Success rate as a fraction (0.0 to 1.0) */
  availability: number;

  /** Provider API version (if available) */
  version?: string;

  /** Timestamp of the last health check */
  lastCheck: Date;

  /** Error rate over recent checks */
  errorRate: number;

  /** Success count over recent checks */
  successRate: number;

  /** Retry count accumulated */
  retryCount: number;
}

// ============================================================================
// PROVIDER CAPABILITIES
// ============================================================================

export interface ProviderCapabilities {
  /** Can download video content */
  supportsVideo: boolean;

  /** Can extract audio content */
  supportsAudio: boolean;

  /** Can download images */
  supportsImages: boolean;

  /** Can download slides/carousel */
  supportsSlides: boolean;

  /** Can download stories (ephemeral content) */
  supportsStories: boolean;

  /** Can download reels/short-form video */
  supportsReels: boolean;

  /** Can download YouTube Shorts */
  supportsShorts: boolean;

  /** Can download playlists */
  supportsPlaylist: boolean;

  /** Can download live streams */
  supportsLive: boolean;

  /** Can download captions/subtitles */
  supportsCaptions: boolean;

  /** Can fetch metadata only (no download) */
  supportsMetadata: boolean;
}

// ============================================================================
// FORMAT TYPE VALUE TYPE
// ============================================================================

/**
 * String values from NovaDLFormatType enum — used in supportedFormats() return.
 */
export type NovaDLFormatTypeValue = string;

// ============================================================================
// HEALTH RESPONSE (for /api/health route)
// ============================================================================

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'offline';
  database: 'connected' | 'disconnected';
  timestamp: string;
  providers: {
    [providerName: string]: ProviderHealth & {
      platform: string;
    };
  };
}

// ============================================================================
// ERROR RE-EXPORT (for provider adapter convenience)
// ============================================================================

export { NovaDLError } from '../errors';
