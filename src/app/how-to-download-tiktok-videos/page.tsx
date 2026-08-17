import Link from 'next/link';
import SeoPage, { seoMetadata, type Crumb, type SeoFaqItem } from '@/components/seo/SeoPage';
import { SITE_URL } from '@/lib/site-config';
import { FileText, ClipboardPaste, Link as LinkIcon, Zap, Download, AlertTriangle } from 'lucide-react';

export const metadata = seoMetadata({
  title: 'How to Download TikTok Videos (2026 Guide) — TikDL',
  description:
    'Step-by-step guide to downloading TikTok videos on iPhone, Android, and desktop. Copy the link, paste it into TikDL, fetch the video, and save the file. Includes troubleshooting for common errors.',
  path: '/how-to-download-tiktok-videos',
});

const crumbs: Crumb[] = [
  { label: 'Home', href: '/' },
  { label: 'How to Download TikTok Videos' },
];

const faqItems: SeoFaqItem[] = [
  {
    question: 'Do I need to install an app to download TikTok videos?',
    answer:
      'No. TikDL is a website, not an app. You can install it to your home screen on Android or iOS for a more app-like experience, but installation is optional. The downloader works in any modern browser including Chrome, Safari, Firefox, and Edge.',
  },
  {
    question: 'Where do I find the TikTok video URL on iPhone?',
    answer:
      'Open the TikTok app, find the video, tap the Share button (the arrow icon on the right side of the screen), and tap "Copy Link" in the share sheet. The URL is now in your clipboard and can be pasted into TikDL.',
  },
  {
    question: 'Why does my TikTok link say "video unavailable"?',
    answer:
      'The most common causes are: the video was deleted by the creator or removed by TikTok, the video is age-restricted and you are not signed in to TikTok, the video is region-locked and your IP is outside the allowed region, or the share link has expired. TikDL cannot bypass these restrictions — if the video is not viewable on TikTok itself, it cannot be downloaded.',
  },
  {
    question: 'Why is the download taking so long?',
    answer:
      'TikDL includes a brief ad countdown before each download — this is what funds the service and keeps it free. The countdown is typically 5 seconds. After the countdown, the actual fetch from TikTok usually takes 1-3 seconds depending on the video size and your connection speed. If the fetch itself hangs, the most likely cause is a network issue between your device and TikTok\'s CDN.',
  },
  {
    question: 'Can I download a TikTok video on a desktop computer?',
    answer:
      'Yes. Open TikTok in your desktop browser, navigate to the video, copy the URL from the browser address bar, and paste it into TikDL. The workflow is identical to mobile. The downloaded file lands in your browser\'s default download folder.',
  },
  {
    question: 'Why does my downloaded video still have a watermark?',
    answer:
      'A small number of TikTok posts do not expose a no-watermark source variant. In those cases TikDL falls back to the watermarked file rather than failing entirely. If you specifically need a no-watermark copy, the only fix is to try a different post or wait — TikTok sometimes rolls out the clean variant later. See our dedicated TikTok no-watermark page for more detail.',
  },
  {
    question: 'Is there a daily limit on how many TikTok videos I can download?',
    answer:
      'TikDL does not enforce a per-day cap on downloads. There is no signup, no account, and no counter tied to your identity. That said, extremely high request rates from a single IP may be rate-limited to protect the service from abuse; normal personal use is never affected.',
  },
];

// HowTo JSON-LD — mirrors the visible step-by-step list.
const HOW_TO_STEPS = [
  'Open TikTok and find the video you want to save.',
  'Tap the Share button and choose "Copy Link".',
  'Switch to TikDL and paste the link into the input at the top of the homepage.',
  'Press the Download button and wait for the brief ad countdown to finish.',
  'In the result card, choose Video for the MP4 or Audio for the MP3.',
  'Click the Download button on the chosen tab to save the file to your device.',
];

const howToLd = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to download a TikTok video',
  description:
    'Step-by-step guide to downloading a TikTok video without watermark using TikDL, including iPhone, Android, and desktop instructions.',
  totalTime: 'PT2M',
  tool: [{ '@type': 'HowToTool', name: 'A modern web browser' }],
  step: HOW_TO_STEPS.map((text, i) => ({
    '@type': 'HowToStep',
    position: i + 1,
    name: `Step ${i + 1}`,
    text,
  })),
};

const articleLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Download TikTok Videos Without Watermark (2026 Guide)',
  description:
    'Step-by-step guide to downloading TikTok videos on iPhone, Android, and desktop using TikDL. Includes troubleshooting for common errors.',
  author: { '@type': 'Organization', name: 'TikDL' },
  publisher: {
    '@type': 'Organization',
    name: 'TikDL',
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png` },
  },
  mainEntityOfPage: `${SITE_URL}/how-to-download-tiktok-videos`,
  datePublished: '2026-08-17',
  dateModified: '2026-08-17',
};

const STEPS = [
  {
    icon: LinkIcon,
    title: 'Copy the TikTok link',
    desc: 'In the TikTok app, open the video you want to save. Tap the Share button (the arrow on the right side of the screen) and choose "Copy Link". The URL is now in your clipboard. On desktop, copy the URL straight from the browser address bar.',
  },
  {
    icon: ClipboardPaste,
    title: 'Open TikDL and paste the link',
    desc: 'Switch to TikDL in your browser. On the homepage, tap the input field at the top and paste the link. You can use the clipboard button on the right of the input to paste automatically on most devices.',
  },
  {
    icon: Zap,
    title: 'Fetch the video',
    desc: 'Press the Download button. TikDL fetches the video metadata from TikTok — title, author, thumbnail, available formats. A brief ad countdown runs before the result appears; this funds the service and keeps it free.',
  },
  {
    icon: Download,
    title: 'Choose your format and save',
    desc: 'In the result card, switch between the Video and Audio tabs. Click the Download button on the format you want. The file is saved to your device — typically the Downloads folder on desktop and Android, or the Files app on iOS.',
  },
];

const TROUBLESHOOTING = [
  {
    problem: 'The result card shows "video unavailable".',
    cause:
      'The video was deleted, age-restricted, region-locked, or the share link expired. TikDL cannot bypass TikTok\'s own access controls.',
    fix: 'Try a different video, or open the link in the TikTok app first to confirm it is still viewable. If TikTok itself shows an error, TikDL will too.',
  },
  {
    problem: 'The downloaded video still has the watermark.',
    cause:
      'A small number of TikTok posts do not expose a no-watermark source variant. TikDL falls back to the watermarked file rather than failing entirely.',
    fix: 'There is no fix on TikDL\'s side — the source variant is determined by TikTok. You can try the same video again later, as TikTok sometimes rolls out the clean variant, but there is no guarantee.',
  },
  {
    problem: 'The download button does nothing.',
    cause:
      'Most commonly this is a browser pop-up blocker intercepting the download. Less commonly, it is a network issue between your device and TikTok\'s CDN.',
    fix: 'Allow pop-ups for tikdl.leadforgeai.site in your browser settings and try again. If the issue persists, try a different network or browser to isolate the cause.',
  },
  {
    problem: 'The paste button does not work on iPhone.',
    cause:
      'Safari on iOS requires explicit user permission for clipboard reads. The first time you tap the paste button, Safari shows a permission prompt.',
    fix: 'Tap "Allow" on the clipboard prompt. Alternatively, tap the input field and use the standard iOS paste gesture (long-press → Paste).',
  },
  {
    problem: 'The audio file will not play in my media player.',
    cause:
      'TikDL delivers the audio in its original format, which is typically AAC inside an MP4 container. Some older media players may not recognise the file by its extension alone.',
    fix: 'Use a modern player like VLC, Apple Music, or Audacity — all of which handle the format natively. Alternatively, rename the file extension from .mp3 to .m4a; the content is the same and some players prefer the .m4a hint.',
  },
];

export default function HowToDownloadPage() {
  return (
    <SeoPage
      navbarPage="features"
      crumbs={crumbs}
      faqItems={faqItems}
      pageKey="how-to-download-tiktok-videos"
      additionalJsonLd={[howToLd, articleLd]}
    >
      {/* ---- Hero ---- */}
      <section className="pt-8 sm:pt-12 pb-6 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-14 h-14 bg-[#A78BFA] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5">
            <FileText size={28} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            How to Download <span className="text-[#A78BFA]">TikTok Videos</span>
          </h1>
          <p className="text-[#9CA3AF] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
            A complete walkthrough for saving TikTok videos on iPhone, Android, and desktop. Copy
            the link, paste it into TikDL, fetch the video, and save the file. Plus
            troubleshooting for the errors you are most likely to hit.
          </p>
        </div>
      </section>

      {/* ---- Quick steps ---- */}
      <section className="py-8 sm:py-10 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-6">The basic flow</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {STEPS.map((step, i) => (
              <div key={step.title} className="glass rounded-[16px] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-[#A78BFA] rounded-xl flex items-center justify-center text-sm font-bold">
                    {i + 1}
                  </div>
                  <step.icon size={18} className="text-[#A78BFA]" />
                  <h3 className="font-semibold text-base">{step.title}</h3>
                </div>
                <p className="text-[#9CA3AF] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-6 text-sm">
            Ready to try it?{' '}
            <Link href="/" className="text-[#FE2C55] hover:underline">
              Open the TikDL downloader
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ---- Device-specific notes ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="glass rounded-[16px] p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">Device-specific notes</h2>

            <h3 className="font-semibold text-base mb-2 text-white">iPhone &amp; iPad (Safari)</h3>
            <p className="text-[#9CA3AF] leading-relaxed mb-4 text-sm">
              Tap Share inside TikTok, then "Copy Link". Switch to Safari and paste into TikDL.
              After download, iOS will prompt you to save the file to the Files app or share it
              to another app. The first time you use TikDL&apos;s paste button, Safari will ask
              for clipboard read permission — tap "Allow".
            </p>

            <h3 className="font-semibold text-base mb-2 text-white">Android (Chrome)</h3>
            <p className="text-[#9CA3AF] leading-relaxed mb-4 text-sm">
              Tap Share inside TikTok, then "Copy link". Switch to Chrome and paste into TikDL.
              Downloaded files land in your Downloads directory. You can also install TikDL to
              your home screen from Chrome&apos;s menu — the installed PWA opens in its own
              window with no browser chrome.
            </p>

            <h3 className="font-semibold text-base mb-2 text-white">Desktop (Chrome, Firefox, Edge, Safari)</h3>
            <p className="text-[#9CA3AF] leading-relaxed text-sm">
              Open tiktok.com in your browser, navigate to the video, and copy the URL from the
              address bar. Paste into TikDL in another tab. Downloaded files land in your
              browser&apos;s default download folder. Desktop is the simplest path because there
              is no clipboard-permission prompt to deal with.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Troubleshooting ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2">
            <AlertTriangle size={22} className="text-[#FBBF24]" />
            Common problems &amp; troubleshooting
          </h2>
          <div className="space-y-4">
            {TROUBLESHOOTING.map((item) => (
              <div key={item.problem} className="glass rounded-[16px] p-5">
                <p className="font-semibold text-sm mb-2 text-white">{item.problem}</p>
                <p className="text-[#9CA3AF] text-sm leading-relaxed mb-2">
                  <span className="text-gray-400">Cause:</span> {item.cause}
                </p>
                <p className="text-[#9CA3AF] text-sm leading-relaxed">
                  <span className="text-gray-400">Fix:</span> {item.fix}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Related feature pages ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto glass rounded-[16px] p-6 sm:p-8">
          <h2 className="text-lg sm:text-xl font-bold mb-3">Looking for a specific feature?</h2>
          <p className="text-[#9CA3AF] text-sm leading-relaxed mb-4">
            TikDL has dedicated pages for the most common download tasks. If you already know
            what you want, jump straight to the relevant feature page.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/tiktok-no-watermark"
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors duration-150"
            >
              Download without watermark ↓
            </Link>
            <Link
              href="/tiktok-mp3-downloader"
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors duration-150"
            >
              TikTok to MP3 ↓
            </Link>
            <Link
              href="/tiktok-photo-downloader"
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors duration-150"
            >
              TikTok photo downloader ↓
            </Link>
            <Link
              href="/is-it-legal-to-download-tiktok-videos"
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors duration-150"
            >
              Is it legal? ↓
            </Link>
          </div>
        </div>
      </section>
    </SeoPage>
  );
}
