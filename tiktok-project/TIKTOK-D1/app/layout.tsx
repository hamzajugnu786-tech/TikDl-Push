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
  title: "TikTok Downloader | Download TikTok Videos Without Watermark",
  description: "Fast, free TikTok downloader. Save videos, audio, and images without watermark in HD. No signup, unlimited downloads.",
  keywords: ["tiktok downloader", "tiktok video without watermark", "save tiktok video", "tiktok mp3"],
  authors: [{ name: "TikDL" }],
  openGraph: {
    title: "TikTok Downloader - No Watermark HD Downloads",
    description: "Download TikTok videos without watermark instantly. Unlimited, fast, mobile-friendly.",
    images: [{ url: "https://picsum.photos/id/1015/1200/630", alt: "TikTok Downloader" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TikTok Downloader",
    description: "Free TikTok video downloader without watermark.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FE2C55" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col bg-black text-white">{children}</body>
    </html>
  );
}
