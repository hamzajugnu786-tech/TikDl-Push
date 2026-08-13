import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// Force dynamic rendering so admin-saved settings (siteName, metaTitle,
// maintenanceMode, primaryColor, etc.) are read fresh from the DB on every
// request. Without this, Next.js may statically render the layout at build
// time and admin changes wouldn't propagate to the user-facing site until a
// redeploy — which is exactly the symptom reported in Bug #4D.
export const dynamic = 'force-dynamic';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ============================================================================
// DYNAMIC METADATA FROM DB SETTINGS
// ============================================================================

// Default values — used when DB is unavailable or settings don't exist
const DEFAULTS = {
  siteName: 'TikDL',
  siteUrl: 'https://tikdl.app',
  metaTitle: 'TikDL — TikTok Video Downloader Without Watermark',
  metaDescription: 'Download TikTok videos without watermark instantly. Free, unlimited, HD quality. Save videos, audio, and cover images in seconds. No signup required.',
  ogImageUrl: '',
  primaryColor: '#FE2C55',
  robotsDirective: 'index, follow',
};

/**
 * Read site settings from the database.
 * Returns a map of key→value for all settings, or empty map on failure.
 */
async function getSiteSettings(): Promise<Record<string, string>> {
  try {
    // Dynamic import to avoid circular dependency issues at build time
    const { db } = await import('@/lib/db');
    const settings = await db.settings.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return map;
  } catch {
    // DB unavailable — use defaults
    return {};
  }
}

/**
 * Generate metadata dynamically from DB settings.
 * This replaces the static `metadata` export so that admin settings
 * (siteName, metaTitle, metaDescription, ogImageUrl, primaryColor, etc.)
 * take effect on the frontend in real-time.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  const siteName = settings['siteName'] || DEFAULTS.siteName;
  const siteUrl = settings['siteUrl'] || DEFAULTS.siteUrl;
  const metaTitle = settings['metaTitle'] || DEFAULTS.metaTitle;
  const metaDescription = settings['metaDescription'] || DEFAULTS.metaDescription;
  const ogImageUrl = settings['ogImageUrl'] || DEFAULTS.ogImageUrl;
  const primaryColor = settings['primaryColor'] || DEFAULTS.primaryColor;
  const robotsDirective = settings['robotsDirective'] || DEFAULTS.robotsDirective;

  const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    // Phase 3 P3-F2 — canonical for the homepage. Defends against query-string
    // variants (?utm_source=..., ?ref=share) being treated as separate pages
    // by search engines. Content pages set their own canonical in their
    // per-page static `metadata` exports.
    alternates: { canonical: siteUrl },
    title: metaTitle,
    description: metaDescription,
    keywords: [
      "tiktok downloader",
      "tiktok video without watermark",
      "save tiktok video",
      "tiktok mp3",
      "tiktok mp4 download",
      "download tiktok no watermark",
      "tiktok audio extractor",
      "tiktok cover image",
      "tiktok saver",
      "free tiktok downloader",
    ],
    authors: [{ name: siteName }],
    icons: {
      icon: [
        { url: "/favicon.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: "/apple-touch-icon.png",
    },
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      url: siteUrl,
      siteName,
      type: "website",
      ...(ogImageUrl ? {
        images: [{
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${siteName} - TikTok Downloader`,
        }],
      } : {
        images: [{
          url: "/icon-512.png",
          width: 512,
          height: 512,
          alt: `${siteName} - TikTok Downloader`,
        }],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDescription,
      images: [ogImageUrl || "/icon-512.png"],
    },
    manifest: "/manifest.json",
    robots: robotsDirective,
  };

  return metadata;
}

// ============================================================================
// ROOT LAYOUT
// ============================================================================

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read settings that affect the HTML layout (primary color, site name)
  const settings = await getSiteSettings();
  const primaryColor = settings['primaryColor'] || DEFAULTS.primaryColor;
  const siteName = settings['siteName'] || DEFAULTS.siteName;
  const maintenanceMode = settings['maintenanceMode'] === 'true';

  // Determine the current route path so the admin dashboard can bypass
  // maintenance mode. Without this, an admin who enables maintenance mode
  // cannot reach /admin to turn it back off. The pathname is exposed by
  // src/middleware.ts as a request header (x-route-pathname).
  let pathname = '';
  try {
    const headerList = await headers();
    pathname = headerList.get('x-route-pathname') || '';
  } catch {
    // headers() not available in this context — skip
  }
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  const showMaintenance = maintenanceMode && !isAdminRoute;

  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <meta name="theme-color" content={primaryColor} />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Inject DB-backed brand colors as CSS custom properties.
            This allows admin to change primaryColor/accentColor in Settings
            and have them propagate to the user-facing site on next page load.
            Components can use `var(--brand-primary)` / `var(--brand-accent)` in inline styles. */}
        <style dangerouslySetInnerHTML={{
          __html: `:root{--brand-primary:${primaryColor};--brand-accent:${settings['accentColor'] || '#25F4EE'};}`
        }} />
      </head>
      <body className="min-h-full flex flex-col bg-[#000000] text-white font-[family-name:var(--font-geist-sans)]">
        {showMaintenance ? (
          <div className="min-h-screen flex items-center justify-center bg-black text-white">
            <div className="text-center p-8">
              <h1 className="text-2xl font-bold mb-4">{siteName}</h1>
              <p className="text-gray-400">We&apos;re currently performing maintenance. Please check back soon.</p>
            </div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
