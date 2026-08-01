/**
 * NovaDL Engine — Provider System Barrel Export
 * 
 * Single import point for all provider types and utilities.
 */

export type { IProvider, IProviderFactory } from './base';
export { ProviderError, BaseProvider } from './base';
export type { ProviderErrorCode } from './base';

export { ProviderRegistry } from './registry';
export type { RegistryEvents } from './registry';

export { YtdlpProvider } from './ytdlp';
export { TikHubProvider } from './tikhub';
export { RapidApiProvider } from './rapidapi';
export { CustomExtractorProvider } from './custom';
export type { CustomExtractorFn } from './custom';

// ─── Provider Scoring ────────────────────────────────────────────────
export { ProviderScorer, DEFAULT_SCORING_CONFIG } from './scoring';
export type { ScorerEvents, ScoringConfig, ScoringWeights, ProviderScoringMetrics, ScoreComponents } from './scoring';

// ─── Circuit Breaker ────────────────────────────────────────────────
export { CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_CONFIG } from './circuit-breaker';
export type { CircuitState, CircuitBreakerConfig, ProviderCircuitInfo, CircuitBreakerEvents } from './circuit-breaker';

// ─── Weighted Routing ──────────────────────────────────────────────
export { WeightedRouter, DEFAULT_WEIGHTED_ROUTING_CONFIG } from './weighted-routing';
export type { WeightedRoutingConfig, ProviderSelection, WeightedRoutingEvents } from './weighted-routing';

// ─── Native Extractors (Priority 1) ──────────────────────────────────
export {
  TikTokNativeExtractor,
  InstagramNativeExtractor,
  FacebookNativeExtractor,
  TwitterNativeExtractor,
  ThreadsNativeExtractor,
  PinterestNativeExtractor,
  RedditNativeExtractor,
  VimeoNativeExtractor,
  DailymotionNativeExtractor,
  LikeeNativeExtractor,
  BilibiliNativeExtractor,
  SnapchatNativeExtractor,
  SoundCloudNativeExtractor,
  SpotifyNativeExtractor,
  Lemon8NativeExtractor,
  CapCutNativeExtractor,
  YouTubeNativeExtractor,
  TumblrNativeExtractor,
  StreamableNativeExtractor,
  VKNativeExtractor,
  MixCloudNativeExtractor,
} from './native/index';
