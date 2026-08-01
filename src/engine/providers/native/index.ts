/**
 * NovaDL Engine — Native Extractors Barrel Export
 *
 * Single import point for all platform-specific native extractors.
 * Native extractors are Priority 1 providers — they parse embedded
 * JSON data directly from page HTML, bypassing any third-party APIs
 * or CLI tools.
 */

export { TikTokNativeExtractor } from './tiktok';
export { InstagramNativeExtractor } from './instagram';
export { FacebookNativeExtractor } from './facebook';
export { TwitterNativeExtractor } from './twitter';
export { ThreadsNativeExtractor } from './threads';
export { PinterestNativeExtractor } from './pinterest';
export { RedditNativeExtractor } from './reddit';
export { VimeoNativeExtractor } from './vimeo';
export { DailymotionNativeExtractor } from './dailymotion';
export { LikeeNativeExtractor } from './likee';
export { BilibiliNativeExtractor } from './bilibili';
export { SnapchatNativeExtractor } from './snapchat';
export { SoundCloudNativeExtractor } from './soundcloud';
export { SpotifyNativeExtractor } from './spotify';
export { Lemon8NativeExtractor } from './lemon8';
export { CapCutNativeExtractor } from './capcut';
export { YouTubeNativeExtractor } from './youtube';
export { TumblrNativeExtractor } from './tumblr';
export { VKNativeExtractor } from './vk';
export { MixCloudNativeExtractor } from './mixcloud';
export { StreamableNativeExtractor } from './streamable';
