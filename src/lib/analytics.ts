/**
 * ====================================================================
 * TikDL — Analytics Event Tracker (GA4)
 * ====================================================================
 *
 * Phase 10: Google Analytics 4 + Search Console + SEO Measurement
 *
 * DESIGN GOALS
 * ------------
 *  - Privacy-conscious: NEVER transmit TikTok URLs, video IDs, usernames,
 *    provider names, error messages, IP addresses, or any raw user data.
 *  - Non-blocking: every call is wrapped in try/catch and SSR-guarded.
 *    If GA4 fails to load, downloads MUST still work, form submission MUST
 *    still work, and no user-visible error should ever appear.
 *  - Small taxonomy: events are limited to the conversion funnel
 *    (submit → metadata success → download click → ad interstitial).
 *
 * EVENT TAXONOMY
 * --------------
 *  - page_view                  — automatic on first load + client route changes
 *  - download_submit            — user submitted a TikTok URL to /api/download
 *  - download_success           — metadata fetch returned a usable video card
 *  - download_error             — fetch failed OR returned unavailable content
 *  - video_download_click       — user clicked a video download button
 *  - audio_download_click       — user clicked an audio download button
 *  - ad_interstitial_shown      — countdown popup was displayed
 *  - ad_interstitial_completed   — countdown completed and download proceeded
 *  - ad_interstitial_skipped     — user dismissed via Escape / manual skip
 *
 * PARAMETERS
 * ----------
 *  Only the following aggregate, non-identifying parameters are sent:
 *    - download_type   : 'video' | 'audio'
 *    - download_result : 'success' | 'failure'
 *    - platform        : 'tiktok'
 *
 * GA4 MEASUREMENT ID
 * ------------------
 *  Read from process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID. The Measurement ID
 *  (format G-XXXXXXXXXX) is PUBLIC by design — it is visible in the page
 *  source of every GA4-enabled site. It is NOT a credential and grants no
 *  write access to GA4 data. Never confuse this with API keys, service
 *  accounts, or OAuth tokens — those remain server-side only.
 *
 *  When the env var is unset or empty, every helper below no-ops. This lets
 *  the same code run in dev, preview, and prod without feature flags.
 */

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

// GA4 collection endpoint — declared here so CSP can be audited in one place.
// This is informational only; the actual fetch is performed by the gtag library.
export const GA4_SCRIPT_SRC = 'https://www.googletagmanager.com/gtag/js';
export const GA4_COLLECT_HOST = 'https://www.google-analytics.com';

/**
 * Track a GA4 event. Safe to call from client components.
 *
 * Guarantees:
 *  - No-op on the server (typeof window === 'undefined')
 *  - No-op if NEXT_PUBLIC_GA_MEASUREMENT_ID is unset
 *  - No-op if window.gtag is not a function (script blocked / not yet loaded)
 *  - Never throws — failures are swallowed silently
 */
export function trackEvent(action: string, params: Record<string, unknown> = {}): void {
  try {
    if (typeof window === 'undefined') return;
    if (!GA_MEASUREMENT_ID) return;
    if (typeof (window as Window & { gtag?: (...args: unknown[]) => void }).gtag !== 'function') return;
    (window as Window & { gtag: (...args: unknown[]) => void }).gtag('event', action, params);
  } catch {
    // Analytics must never break the UI or a download. Swallow silently.
  }
}

/**
 * Centralized analytics helpers — keep the taxonomy in ONE place so call
 * sites cannot accidentally leak sensitive parameters (URLs, IDs, etc.).
 *
 * Usage:
 *   import { analytics } from '@/lib/analytics';
 *   analytics.downloadSubmit();
 *   analytics.videoDownloadClick();
 */
export const analytics = {
  /** Manual page_view for client-side route changes. The initial pageview
   *  is fired automatically by gtag('config', ...) in GA4.tsx. */
  pageView: (path: string) => trackEvent('page_view', { page_path: path }),

  /** Fired when the user submits a TikTok URL to /api/download. */
  downloadSubmit: () => trackEvent('download_submit', { platform: 'tiktok' }),

  /** Fired when /api/download returned a usable video card. */
  downloadSuccess: () => trackEvent('download_success', {
    platform: 'tiktok',
    download_result: 'success',
  }),

  /** Fired when /api/download failed OR returned unavailable content. */
  downloadError: () => trackEvent('download_error', {
    platform: 'tiktok',
    download_result: 'failure',
  }),

  /** Fired when the user clicks a VIDEO download button. */
  videoDownloadClick: () => trackEvent('video_download_click', {
    download_type: 'video',
    platform: 'tiktok',
  }),

  /** Fired when the user clicks an AUDIO download button. */
  audioDownloadClick: () => trackEvent('audio_download_click', {
    download_type: 'audio',
    platform: 'tiktok',
  }),

  /** Fired when the ad interstitial countdown popup is displayed. */
  adInterstitialShown: () => trackEvent('ad_interstitial_shown'),

  /** Fired when the ad interstitial countdown completes and the download
   *  is allowed to proceed. */
  adInterstitialCompleted: () => trackEvent('ad_interstitial_completed'),

  /** Fired when the user dismisses the ad interstitial before countdown
   *  completes (e.g. Escape key). */
  adInterstitialSkipped: () => trackEvent('ad_interstitial_skipped'),
};
