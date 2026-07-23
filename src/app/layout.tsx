import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tikdl.app"),
  title: "TikDL — TikTok Video Downloader Without Watermark",
  description: "Download TikTok videos without watermark instantly. Free, unlimited, HD quality. Save videos, audio, and cover images in seconds. No signup required.",
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
  authors: [{ name: "TikDL" }],
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: "TikDL — TikTok Downloader Without Watermark",
    description: "Fast, free TikTok video downloader. Save videos without watermark in HD quality. Unlimited downloads, no signup.",
    url: "https://tikdl.app",
    siteName: "TikDL",
    type: "website",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "TikDL - TikTok Downloader",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TikDL — TikTok Downloader Without Watermark",
    description: "Download TikTok videos without watermark instantly. Free, unlimited, HD.",
    images: ["/icon-512.png"],
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <meta name="theme-color" content="#FE2C55" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-full flex flex-col bg-[#000000] text-white font-[family-name:var(--font-geist-sans)]">
        {children}
      </body>
    </html>
  );
}
