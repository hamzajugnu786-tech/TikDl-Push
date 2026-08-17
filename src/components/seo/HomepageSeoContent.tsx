import Link from 'next/link';
import { Download, Music, Shield, Smartphone, FileText, Droplet } from 'lucide-react';

// ============================================================================
// HomepageSeoContent — additional crawlable H2 sections added to the
// homepage in Stage 3 to convert the homepage from a thin tool page into a
// topical hub for TikTok downloading.
// ============================================================================
//
// Placement:
//   Rendered at the bottom of the homepage (after the FAQ accordion, before
//   the universal "between_sections" AdSlot). The downloader UI above the
//   fold is untouched.
//
// Content principles (from SEO_GROWTH_PLAN.md §11 + Stage 3 brief):
//   - Each section has a genuine user purpose (not keyword stuffing).
//   - Internal links use natural, descriptive anchor text — never exact-
//     match repetition. Link targets: /tiktok-no-watermark,
//     /tiktok-mp3-downloader, /how-to-download-tiktok-videos,
//     /tiktok-photo-downloader, /is-it-legal-to-download-tiktok-videos.
//   - No unsupported claims ("100% anonymous", "fastest", "best", etc.).
//   - Honest limitations (private/age-restricted videos are not supported).
//   - Written for humans first; keywords appear naturally, not stuffed.
//
// Server Component (no 'use client') so the content lands in the initial
// SSR HTML — better for crawlers and for users on slow connections. The
// parent homepage is 'use client', but Next.js still SSRs client components,
// so this content appears in the initial HTML response.
// ============================================================================

const HOMEPAGE_SEO_SECTIONS = [
  {
    icon: Download,
    color: '#FE2C55',
    title: 'TikTok Video Downloader',
    body: (
      <>
        <p>
          TikDL is a free web-based tool that lets you save TikTok videos directly to your device.
          Paste a TikTok link, fetch the video, and choose whether to keep the full video, extract
          the audio, or save the cover image. There is no app to install, no account to create,
          and no per-day download cap — every step happens in your browser on the device you are
          already using.
        </p>
        <p>
          Unlike many downloader sites that re-encode the file or wrap it in a container with
          their own branding, TikDL fetches the same source file TikTok serves to the TikTok app.
          That means the resolution, frame rate, and audio bitrate you receive match the original
          upload. If a creator posted a 1080p clip, you receive a 1080p clip. We do not downscale
          or recompress.
        </p>
      </>
    ),
  },
  {
    icon: Droplet,
    color: '#38BDF8',
    title: 'Download TikTok Videos Without Watermark',
    body: (
      <>
        <p>
          Every video on TikTok is published with a bouncing watermark that shows the creator&apos;s
          handle and the TikTok logo. Many people want a copy without that overlay — for offline
          viewing on a long flight, for editing into a compilation they have permission to make, or
          simply because the watermark distracts from the content. TikDL fetches the no-watermark
          source variant when TikTok makes one available, so the file you save is the clean copy.
        </p>
        <p>
          For a deeper walkthrough of the no-watermark workflow — including what to do when a
          particular video does not have a clean variant available — see the dedicated{' '}
          <Link href="/tiktok-no-watermark" className="text-[#FE2C55] hover:underline">
            TikTok no-watermark downloader
          </Link>{' '}
          page.
        </p>
      </>
    ),
  },
  {
    icon: Music,
    color: '#25F4EE',
    title: 'Download TikTok Videos as MP3',
    body: (
      <>
        <p>
          Sometimes you only want the sound — a trending audio clip, a piece of background music,
          or a creator&apos;s original voiceover. TikDL exposes an Audio tab on every result so you
          can save just the audio track as an MP3 file, without re-downloading the full video.
          The bitrate matches whatever TikTok encoded for the original post.
        </p>
        <p>
          If you plan to reuse the audio in your own content, remember that most TikTok sounds are
          licensed music or someone else&apos;s original work. Personal offline listening is generally
          fine; redistribution usually is not. The dedicated{' '}
          <Link href="/tiktok-mp3-downloader" className="text-[#FE2C55] hover:underline">
            TikTok MP3 downloader
          </Link>{' '}
          page walks through the audio workflow in more detail.
        </p>
      </>
    ),
  },
  {
    icon: FileText,
    color: '#A78BFA',
    title: 'How to Download a TikTok Video',
    body: (
      <>
        <p>
          The basic flow takes under a minute. Open TikTok, find the video you want, tap the
          Share button, and choose <em>Copy Link</em>. Switch back to TikDL, paste the link into
          the input at the top of this page, and press Download. After a short ad countdown — this
          is what keeps TikDL free — you will see the video preview, the no-watermark download
          button, the audio tab, and the cover image.
        </p>
        <p>
          For a longer step-by-step guide that covers iPhone, Android, and desktop Safari/Chrome
          differences — plus troubleshooting for common issues like region-blocked videos or
          expired share links — read the{' '}
          <Link href="/how-to-download-tiktok-videos" className="text-[#FE2C55] hover:underline">
            how to download TikTok videos
          </Link>{' '}
          guide.
        </p>
      </>
    ),
  },
  {
    icon: Shield,
    color: '#34D399',
    title: 'Why Use TikDL',
    body: (
      <>
        <p>
          TikDL was built around three principles: the downloader should be honest about what it
          can and cannot do, the file you receive should be the original quality, and your
          activity should not be logged or tied back to you. We do not store the videos you fetch,
          we do not keep a database of TikTok URLs you paste, and we do not require an account.
        </p>
        <p>
          The trade-offs are documented openly: a brief ad countdown before each download funds
          the service, and we cannot bypass TikTok&apos;s restrictions on private videos,
          age-restricted content, or region-locked posts. If a video is not publicly viewable on
          TikTok itself, TikDL cannot fetch it. For the full picture, see our{' '}
          <Link href="/privacy" className="text-[#FE2C55] hover:underline">privacy policy</Link>{' '}
          and the{' '}
          <Link
            href="/is-it-legal-to-download-tiktok-videos"
            className="text-[#FE2C55] hover:underline"
          >
            legality overview
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    icon: Smartphone,
    color: '#FBBF24',
    title: 'Works on Every Device',
    body: (
      <>
        <p>
          TikDL is a Progressive Web App, which means it works in any modern browser — Chrome and
          Safari on Android, Safari on iPhone and iPad, and Chrome, Firefox, and Edge on desktop.
          On Android you can install TikDL to your home screen from Chrome&apos;s menu; the
          installed app opens in its own window with no browser chrome and supports a splash
          screen on launch. iOS users can add TikDL to their home screen via Safari&apos;s Share
          sheet.
        </p>
        <p>
          TikTok photo posts — the swipeable image slideshows some creators publish instead of a
          video — are also supported. When you paste a photo-post link, TikDL lists each image
          individually so you can save one or all of them. The{' '}
          <Link href="/tiktok-photo-downloader" className="text-[#FE2C55] hover:underline">
            TikTok photo downloader
          </Link>{' '}
          page explains how that workflow differs from a normal video download.
        </p>
      </>
    ),
  },
];

export default function HomepageSeoContent() {
  return (
    <section className="py-8 sm:py-12 px-4 sm:px-6 bg-[#0a0a0a] border-t border-white/5">
      <div className="max-w-3xl mx-auto space-y-8 sm:space-y-10">
        {HOMEPAGE_SEO_SECTIONS.map((s) => (
          <div key={s.title} className="space-y-3">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${s.color}15` }}
              >
                <s.icon size={18} style={{ color: s.color }} />
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">{s.title}</h2>
            </div>
            <div className="text-sm sm:text-[15px] text-[#9CA3AF] leading-relaxed space-y-3 pl-12 sm:pl-12">
              {s.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
