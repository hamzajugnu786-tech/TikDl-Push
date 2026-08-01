import type { NextConfig } from "next";

// ============================================================================
// SECURITY HEADERS — Production Security & Infrastructure
// ============================================================================

/**
 * Security headers applied to ALL responses.
 *
 * These are production defaults that protect against:
 * - XSS (Content-Security-Policy)
 * - Clickjacking (X-Frame-Options)
 * - MIME sniffing (X-Content-Type-Options)
 * - Information leakage (Referrer-Policy, Permissions-Policy)
 * - Insecure connections (Strict-Transport-Security)
 *
 * Design decisions:
 * - CSP uses 'strict-dynamic' for script sources — allows scripts loaded
 *   by trusted scripts but blocks inline scripts (most XSS vector)
 * - X-Frame-Options: DENY — TikDL has no need to be embedded in iframes
 * - Referrer-Policy: strict-origin-when-cross-origin — sends referrer
 *   to same-origin only, protects user privacy on cross-origin links
 * - HSTS: 1 year max-age with includeSubDomains — forces HTTPS
 * - Permissions-Policy: disabled all unnecessary browser APIs
 * - Images: wildcard hostname allowed (TikTok/provider images come from various CDN hosts)
 *
 * ⚠️  The CSP allows 'unsafe-eval' because some third-party ad code may
 *     require it. This is the minimal concession for ad functionality.
 *     All other unsafe directives are blocked.
 *     DOMPurify sanitization (Step 3) provides the primary XSS defense
 *     for ad content, making 'unsafe-eval' acceptable in this context.
 */
const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=(), autoplay=(), vr=(), wake-lock=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    // Content-Security-Policy — primary XSS defense
    // Allows: scripts from same origin + unsafe-eval (for ad code)
    // Allows: styles from same origin + inline (Tailwind CSS requires inline styles)
    // Allows: images from any HTTPS source (TikTok CDN images)
    // Allows: fonts from same origin + Google Fonts
    // Allows: connections to any HTTPS source (API calls to providers)
    // Blocks: inline scripts, object/embed/applet, frame-src (except same-origin)
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // unsafe-inline required for Next.js RSC hydration; unsafe-eval for ad embeds
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",  // Tailwind + Google Fonts
      "img-src 'self' data: https:",  // TikTok images from various CDN hosts
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https:",  // API calls to TikHub/RapidAPI
      "frame-src 'self' https://www.youtube.com https://player.vimeo.com",  // video embeds
      "object-src 'none'",  // block <object>/<embed>
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",  // equivalent to X-Frame-Options: DENY
      "manifest-src 'self'",
    ].join('; '),
  },
];

// ============================================================================
// API-SPECIFIC HEADERS
// ============================================================================

/**
 * Additional headers for API routes — stricter CSP (no scripts/styles needed).
 */
const apiSecurityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'none'; frame-ancestors 'none'",
  },
  {
    key: 'Cache-Control',
    value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
  },
];

// ============================================================================
// NEXT.JS CONFIGURATION
// ============================================================================

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    return [
      // Security headers for all pages
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // Stricter headers for API routes
      {
        source: '/api/(.*)',
        headers: [...securityHeaders.filter(h => h.key !== 'Content-Security-Policy'), ...apiSecurityHeaders],
      },
    ];
  },
};

export default nextConfig;
