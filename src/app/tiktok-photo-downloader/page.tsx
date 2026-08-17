import Link from 'next/link';
import SeoPage, { seoMetadata, type Crumb, type SeoFaqItem } from '@/components/seo/SeoPage';
import { SITE_URL } from '@/lib/site-config';
import { Image as ImageIcon, Link as LinkIcon, Zap, Download } from 'lucide-react';

export const metadata = seoMetadata({
  title: 'TikTok Photo & Slideshow Downloader — Save HD Images | TikDL',
  description:
    'Download individual images from a TikTok photo post (swipeable slideshow). Save one slide or all of them in original resolution. Free, no signup, works on every device.',
  path: '/tiktok-photo-downloader',
});

const crumbs: Crumb[] = [
  { label: 'Home', href: '/' },
  { label: 'TikTok Photo Downloader' },
];

const faqItems: SeoFaqItem[] = [
  {
    question: 'What is a TikTok photo post?',
    answer:
      'A TikTok photo post (sometimes called a slideshow or carousel) is a post where the creator uploaded multiple images instead of a video. TikTok displays them as a swipeable carousel with optional background music. Photo posts are different from regular video posts — they contain still images, not a video stream.',
  },
  {
    question: 'How is downloading a photo post different from downloading a video?',
    answer:
      'When you paste a TikTok photo post link into TikDL, the result card shows the slideshow as a navigable carousel instead of a video preview. You can step through each image, select which ones to save, and download them individually. Each image is saved as a separate file at the original resolution the creator uploaded.',
  },
  {
    question: 'Can I download all images from a TikTok photo post at once?',
    answer:
      'TikDL lets you select all images with one tap (the "select all" checkbox at the top of the carousel) and then download each selected image. Downloads are sequential — there is no zip-file batch export. For most photo posts (typically 3-12 images) this takes only a few seconds per image.',
  },
  {
    question: 'What resolution are the downloaded images?',
    answer:
      'TikDL fetches each image at the original resolution TikTok stored for that slide. TikTok typically stores photo-post images at the resolution the creator uploaded, which is often 1080×1350 or 1080×1920 depending on the original aspect ratio. TikDL does not resize or recompress the images.',
  },
  {
    question: 'Does this work for TikTok photo posts that contain music?',
    answer:
      'Yes. The images and the background music are separate tracks in a TikTok photo post. TikDL\'s photo-download feature focuses on the images. If you also want the audio, switch to the Audio tab in the result card after fetching the link — the same workflow as a regular video post.',
  },
  {
    question: 'Why does my TikTok photo link show up as a video?',
    answer:
      'Two possibilities. First, the post may actually be a video that opens with a still frame — some creators format videos to look like photo posts. Second, the photo-post indicator may not have been detected by the provider for that specific post. In either case, TikDL falls back to treating it as a video and you can still download the file. If you specifically need the individual images, try the same link again later — provider coverage of photo posts is generally good but not 100%.',
  },
];

const webAppLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'TikDL — TikTok Photo & Slideshow Downloader',
  url: `${SITE_URL}/tiktok-photo-downloader`,
  description:
    'Free TikTok photo post downloader. Save individual images from a TikTok slideshow carousel at original resolution. No signup, no app install, works on every device.',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  browserRequirements: 'Requires a modern web browser with JavaScript enabled.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Download individual images from TikTok photo posts',
    'Save one slide or all slides at original resolution',
    'No signup or account required',
    'Works on iPhone, Android, tablet, and desktop',
  ],
};

const STEPS = [
  {
    icon: LinkIcon,
    title: 'Copy the photo post link',
    desc: 'In TikTok, tap Share on the photo post and choose "Copy Link". Photo posts use the same share mechanism as videos.',
  },
  {
    icon: Zap,
    title: 'Paste and fetch in TikDL',
    desc: 'Paste the link into the input on the TikDL homepage and press Download. The result card detects the photo post and shows the slideshow carousel.',
  },
  {
    icon: Download,
    title: 'Select slides and save',
    desc: 'Use the carousel arrows to preview each image. Tap "Select all" to grab every slide, or check individual images. Press Download for each selected image to save it to your device.',
  },
];

export default function TikTokPhotoDownloaderPage() {
  return (
    <SeoPage
      navbarPage="features"
      crumbs={crumbs}
      faqItems={faqItems}
      pageKey="tiktok-photo-downloader"
      additionalJsonLd={[webAppLd]}
    >
      {/* ---- Hero ---- */}
      <section className="pt-8 sm:pt-12 pb-6 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-14 h-14 bg-[#34D399] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5">
            <ImageIcon size={28} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Download TikTok <span className="text-[#34D399]">Photo Slideshows</span>
          </h1>
          <p className="text-[#9CA3AF] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
            Save the individual images from a TikTok photo post — also known as a slideshow or
            carousel. Pick one slide or grab all of them at the original resolution the creator
            uploaded. Free, no signup, works on every device.
          </p>
        </div>
      </section>

      {/* ---- What a photo post is ---- */}
      <section className="py-8 sm:py-10 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="glass rounded-[16px] p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">What a TikTok photo post is</h2>
            <p className="text-[#9CA3AF] leading-relaxed mb-3">
              A TikTok photo post is a post where the creator uploaded one or more still images
              instead of recording a video. TikTok displays them as a swipeable carousel — the
              viewer swipes left and right to move between slides — and the post can include a
              background music track that plays while the carousel is open. Photo posts are
              increasingly common for fashion lookbooks, recipe step galleries, before-and-after
              comparisons, and travel photo dumps.
            </p>
            <p className="text-[#9CA3AF] leading-relaxed mb-3">
              From a downloader&apos;s perspective, a photo post is fundamentally different from a
              video post. A video post is a single MP4 file with both video and audio tracks. A
              photo post is a set of separate image files plus an audio track. TikDL handles
              both, but the result-card UI is different: a video post shows a video preview and
              download button, while a photo post shows a navigable carousel with per-image
              selection.
            </p>
            <p className="text-[#9CA3AF] leading-relaxed">
              TikDL fetches each image at the original resolution TikTok stored for that slide.
              The images are not stitched into a video, watermarked, or recompressed — what you
              save is what TikTok received from the creator.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Step-by-step ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center">How to download TikTok photos</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step) => (
              <div key={step.title} className="glass rounded-[16px] p-5 text-center">
                <div className="w-10 h-10 bg-[#34D399] rounded-xl flex items-center justify-center text-lg font-bold mx-auto mb-3">
                  <step.icon size={20} className="text-black" />
                </div>
                <h3 className="font-semibold text-base mb-2">{step.title}</h3>
                <p className="text-[#9CA3AF] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-6 text-sm">
            Need the broader context? Read the{' '}
            <Link href="/how-to-download-tiktok-videos" className="text-[#FE2C55] hover:underline">
              how to download TikTok videos
            </Link>{' '}
            guide.
          </p>
        </div>
      </section>

      {/* ---- Limitations ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="glass rounded-[16px] p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">What TikDL cannot do</h2>
            <ul className="text-[#9CA3AF] leading-relaxed space-y-2 list-disc list-inside">
              <li>
                Download images from a private, age-restricted, or deleted photo post. If the
                post is not viewable on TikTok itself, TikDL cannot fetch it.
              </li>
              <li>
                Export all slides as a single zip file. Each image is saved individually — for
                most photo posts (3-12 images) this is fast, but bulk-zip is not supported.
              </li>
              <li>
                Re-stitch the images back into a video. TikDL saves the original image files; it
                does not re-encode them into a slideshow video.
              </li>
              <li>
                Bypass TikTok&apos;s region locks. Photo posts restricted to specific regions
                cannot be fetched from outside those regions.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---- Cross-links ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto glass rounded-[16px] p-6 sm:p-8">
          <h2 className="text-lg sm:text-xl font-bold mb-3">Related TikDL features</h2>
          <p className="text-[#9CA3AF] text-sm leading-relaxed mb-4">
            TikDL also handles regular TikTok videos and audio extraction. If your link turns out
            to be a video rather than a photo post, the same tool can still help.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/tiktok-no-watermark"
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors duration-150"
            >
              TikTok no-watermark video ↓
            </Link>
            <Link
              href="/tiktok-mp3-downloader"
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors duration-150"
            >
              TikTok to MP3 ↓
            </Link>
          </div>
        </div>
      </section>
    </SeoPage>
  );
}
