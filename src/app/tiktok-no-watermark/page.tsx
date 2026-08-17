import Link from 'next/link';
import SeoPage, { seoMetadata, type Crumb, type SeoFaqItem } from '@/components/seo/SeoPage';
import { SITE_URL } from '@/lib/site-config';
import { Droplet, Link as LinkIcon, Zap, Download, Shield } from 'lucide-react';

export const metadata = seoMetadata({
  title: 'TikTok Downloader Without Watermark — Free HD | TikDL',
  description:
    'Download TikTok videos without the bouncing watermark in original HD quality. Paste a link, fetch, and save the clean MP4. Free, no signup, works on mobile and desktop.',
  path: '/tiktok-no-watermark',
});

const crumbs: Crumb[] = [
  { label: 'Home', href: '/' },
  { label: 'TikTok No Watermark' },
];

const faqItems: SeoFaqItem[] = [
  {
    question: 'What does "without watermark" actually mean?',
    answer:
      'TikTok publishes every video with a bouncing overlay that shows the creator\'s @handle and the TikTok logo. A "no watermark" download is the same video file without that overlay baked in. TikDL fetches the no-watermark source variant directly when TikTok makes one available, so the file you save is the clean copy at the original resolution.',
  },
  {
    question: 'Will the no-watermark file be the same quality as the original?',
    answer:
      'Yes. TikDL does not re-encode or recompress the video. The resolution, frame rate, and audio bitrate you receive match what TikTok serves to the TikTok app for that post. If the creator uploaded a 1080p clip, you receive a 1080p clip.',
  },
  {
    question: 'Why do some videos not have a no-watermark variant?',
    answer:
      'A small number of TikTok posts — typically region-restricted, age-restricted, or private content — do not expose a clean source URL. In those cases TikDL falls back to the watermarked variant or returns an error explaining that the post cannot be fetched. TikDL cannot bypass TikTok\'s own access controls.',
  },
  {
    question: 'Is downloading a TikTok without the watermark legal?',
    answer:
      'Saving a public TikTok video for personal offline viewing is generally acceptable in most jurisdictions. Removing the watermark does not change the underlying copyright — the creator still owns the video. Re-uploading, redistributing, or monetising someone else\'s content without permission may infringe copyright even if the watermark is gone. See our dedicated page on whether it is legal to download TikTok videos for a fuller discussion.',
  },
  {
    question: 'Does TikDL keep a copy of the videos I download?',
    answer:
      'No. TikDL streams the video from TikTok\'s CDN through to your browser and does not store the file on its own servers. The only record of the download is in your own browser history. See our privacy policy for the full details.',
  },
  {
    question: 'Can I download multiple TikTok videos at once?',
    answer:
      'TikDL processes one link at a time. There is no daily cap on how many links you can fetch, but there is no batch-paste feature — each download requires its own paste-and-fetch cycle. This keeps the workflow simple and lets you preview each video before saving it.',
  },
];

// WebApplication JSON-LD scoped to the no-watermark feature.
const webAppLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'TikDL — TikTok No-Watermark Downloader',
  url: `${SITE_URL}/tiktok-no-watermark`,
  description:
    'Free TikTok video downloader that fetches the no-watermark source variant in original HD quality. No signup, no app install, works on iPhone, Android, and desktop.',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  browserRequirements: 'Requires a modern web browser with JavaScript enabled.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Download TikTok videos without the watermark',
    'Original HD quality, no recompression',
    'No signup or account required',
    'Works on iPhone, Android, tablet, and desktop',
  ],
};

const STEPS = [
  {
    icon: LinkIcon,
    title: 'Copy the TikTok link',
    desc: 'Open TikTok, tap Share on the video, then tap "Copy Link". You can also copy the URL straight from a desktop browser address bar.',
  },
  {
    icon: Zap,
    title: 'Paste it into TikDL',
    desc: 'Switch to TikDL and paste the link into the input at the top of the homepage. Press Download to fetch the video.',
  },
  {
    icon: Download,
    title: 'Save the no-watermark file',
    desc: 'After the brief ad countdown, click the Download Video button. The file saved to your device is the clean, no-watermark MP4 at original quality.',
  },
];

export default function TikTokNoWatermarkPage() {
  return (
    <SeoPage
      navbarPage="features"
      crumbs={crumbs}
      faqItems={faqItems}
      pageKey="tiktok-no-watermark"
      additionalJsonLd={[webAppLd]}
    >
      {/* ---- Hero / intro ---- */}
      <section className="pt-8 sm:pt-12 pb-6 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-14 h-14 bg-[#FE2C55] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5">
            <Droplet size={28} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Download TikTok Videos <span className="text-[#FE2C55]">Without Watermark</span>
          </h1>
          <p className="text-[#9CA3AF] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
            Save the clean, original-quality MP4 from any public TikTok post — no bouncing
            @handle overlay, no TikTok logo, no recompression. Free, no signup, works in your
            browser on phone and desktop.
          </p>
        </div>
      </section>

      {/* ---- What this feature does ---- */}
      <section className="py-8 sm:py-10 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="glass rounded-[16px] p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">What this feature does</h2>
            <p className="text-[#9CA3AF] leading-relaxed mb-3">
              Every video on TikTok is published with a bouncing watermark that overlays the
              creator&apos;s handle and the TikTok logo. The watermark is useful for attribution
              inside TikTok, but it gets in the way when you want a clean copy for offline
              viewing, for a compilation you have permission to edit, or simply because the
              overlay distracts from the content itself.
            </p>
            <p className="text-[#9CA3AF] leading-relaxed mb-3">
              TikDL fetches the no-watermark source variant that TikTok serves to its own apps.
              The file you save is the same resolution, frame rate, and audio bitrate as the
              original upload — TikDL does not re-encode, recompress, or strip anything out. If
              the creator posted a 1080p clip, you receive a 1080p clip.
            </p>
            <p className="text-[#9CA3AF] leading-relaxed">
              Removing the watermark does not change who owns the video. The creator still holds
              the copyright, and the rules about redistributing someone else&apos;s content apply
              exactly the same way they would to the watermarked version.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Step-by-step ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step) => (
              <div key={step.title} className="glass rounded-[16px] p-5 text-center">
                <div className="w-10 h-10 bg-[#FE2C55] rounded-xl flex items-center justify-center text-lg font-bold mx-auto mb-3">
                  <step.icon size={20} />
                </div>
                <h3 className="font-semibold text-base mb-2">{step.title}</h3>
                <p className="text-[#9CA3AF] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-6 text-sm">
            Need the full walkthrough? Read the{' '}
            <Link href="/how-to-download-tiktok-videos" className="text-[#FE2C55] hover:underline">
              how to download TikTok videos
            </Link>{' '}
            guide.
          </p>
        </div>
      </section>

      {/* ---- Why no-watermark matters + limitations ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="glass rounded-[16px] p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">Why no-watermark downloads may be useful</h2>
            <ul className="text-[#9CA3AF] leading-relaxed space-y-2 list-disc list-inside">
              <li>Offline viewing on flights, commutes, or anywhere with no signal.</li>
              <li>Editing into a compilation, reaction, or commentary video you have permission to make.</li>
              <li>Archiving a creator&apos;s work for personal reference (with their consent where redistribution is concerned).</li>
              <li>Watching on a larger screen where the bouncing watermark is more visually intrusive.</li>
            </ul>
          </div>

          <div className="glass rounded-[16px] p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2">
              <Shield size={20} className="text-[#FE2C55]" />
              Limitations &amp; responsible use
            </h2>
            <p className="text-[#9CA3AF] leading-relaxed mb-3">
              TikDL cannot bypass TikTok&apos;s own access controls. Posts that are private,
              age-restricted, deleted, or region-locked cannot be fetched — if the video is not
              viewable on TikTok itself, it cannot be downloaded here either. A small number of
              public posts also do not expose a no-watermark source variant; in those cases
              TikDL will either fall back to the watermarked file or return a clear error.
            </p>
            <p className="text-[#9CA3AF] leading-relaxed">
              Always respect creators. Saving a video for personal offline use is one thing;
              re-uploading someone else&apos;s work without permission — with or without the
              watermark — is copyright infringement in most jurisdictions. See our page on{' '}
              <Link
                href="/is-it-legal-to-download-tiktok-videos"
                className="text-[#FE2C55] hover:underline"
              >
                whether it is legal to download TikTok videos
              </Link>{' '}
              for a fuller discussion.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Cross-links to sibling feature pages ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto glass rounded-[16px] p-6 sm:p-8">
          <h2 className="text-lg sm:text-xl font-bold mb-3">Related TikDL features</h2>
          <p className="text-[#9CA3AF] text-sm leading-relaxed mb-4">
            TikDL also extracts audio and downloads photo posts. If you want a different output
            format from the same TikTok link, the same tool can do that.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
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
          </div>
        </div>
      </section>
    </SeoPage>
  );
}
