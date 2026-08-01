/**
 * NovaDL Service Layer — Phase 1 Barrel Export
 *
 * Central export point for all NovaDL service modules.
 * Import from here when using the service layer:
 *
 *   import { DownloadService, PlatformDetector, ... } from '@/services';
 */

// Core types
export type {
  NovaDLResult,
  NovaDLFormat,
  NovaDLAudio,
  NovaDLImage,
  NovaDLMetadata,
  ServiceResult,
  NovaDLErrorInfo,
} from './types';

export {
  NovaDLFormatType,
  NovaDLImageType,
} from './types';

// Error standardisation
export { NovaDLErrorCode, NovaDLError, generateRequestId } from './errors';

// Provider utilities (shared across adapters)
export { mapHttpError, createOfflineHealth, wrapProviderError } from './provider-utils';

// Provider interface
export type {
  NovaDLProvider,
  ProviderHealth,
  ProviderCapabilities,
  HealthResponse,
} from './providers/types';

export type { NovaDLFormatTypeValue } from './providers/types';

// Provider registry
export { ProviderRegistry, getRegistry, resetRegistry } from './providers/registry';

// Platform detector
export { PlatformDetector } from './platform-detector';
export type { PlatformInfo } from './platform-detector';

// Download service
export { DownloadService, getDownloadService } from './download';

// Structured logging
export { DownloadLogger, getLogger } from './logger';
export type { DownloadLogEntry, DownloadStats } from './logger';

// Result mapper (backward compatibility bridge)
export { adaptResultForDisplay, serviceResultToApiResponse } from '@/lib/result-to-display';
export type { VideoInfo, DownloadApiResponse } from '@/lib/result-to-display';

// Initialization
export { initializeNovaDL, isNovaDLInitialized, resetNovaDL } from './init';

// Engine bridge (real NovaDL engine integration)
export { extractWithEngine, isEngineInitialized, resetEngine } from './engine-bridge';

// TikTok provider adapters
export { TikTokTikHubAdapter } from './providers/adapters/tiktok/tikhub';
export { TikTokRapidAPIAdapter } from './providers/adapters/tiktok/rapidapi';
export { registerTikTokProviders } from './providers/adapters/tiktok/index';
