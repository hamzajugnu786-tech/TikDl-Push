import Link from 'next/link';
import SeoPage, { seoMetadata, type Crumb, type SeoFaqItem } from '@/components/seo/SeoPage';
import { SITE_URL } from '@/lib/site-config';
import { Music, Link as LinkIcon, Zap, Download, AlertCircle } from 'lucide-react';

export const metadata = seoMetadata({
  title: 'TikTok to MP3 Downloader — Free Audio Extractor | TikDL',
  description:
    'Extract the audio track from any public TikTok video and save it as an MP3 file. Original bitrate, no recompression, no signup. Free and works on every device.',
  path: '/tiktok-mp3-downloader',
});

const crumbs: Crumb[] = [
  { label: 'Home', href: '/' },
  { label: 'TikTok MP3 Downloader' },
];

const faqItems: SeoFaqItem[] = [
  {
    question: 'Can every TikTok video be converted to MP3?',
    answer:
      'Almost every public TikTok video that contains audio can be saved as an MP3 through TikDL. A small number of posts — silent clips, region-restricted content, or videos TikTok has muted for copyright reasons — may not produce a usable audio file. TikDL cannot extract audio that the original post does not contain.',
  },
  {
    question: 'What bitrate is the MP3?',
    answer:
      'TikDL does not re-encode the audio. The file you receive is the same audio track TikTok packaged with the original post, typically AAC inside an MP4 container that most media players recognise as MP3-compatible. The bitrate matches whatever the creator uploaded — TikDL does not downmix, normalise, or recompress.',
  },
  {
    question: 'Is it legal to download TikTok audio as MP3?',
    answer:
      'Saving the audio from a public TikTok for personal offline listening is generally acceptable. However, most trending TikTok sounds are licensed music or another creator\'s original work, which means redistributing the audio — using it in your own video, uploading it to a streaming platform, or sharing the MP3 file publicly — typically requires permission from the rights holder. Personal use does not eliminate the underlying copyright.',
  },
  {
    question: 'How is the MP3 download different from the video download?',
    answer:
      'The video download saves the full MP4 with both video and audio tracks. The MP3 download saves only the audio track, in a smaller file with no video component. Both come from the same TikTok post — you choose which one to keep after fetching the link in TikDL.',
  },
  {
    question: 'Where does the downloaded MP3 file go?',
    answer:
      'On desktop, the file is saved to your browser\'s default download folder. On Android, it lands in your Downloads directory. On iOS, Safari will prompt you to save the file to the Files app or share it to another app. TikDL does not store the MP3 on its own servers — the file goes directly from TikTok\'s CDN to your device.',
  },
  {
    question: 'Can I download just the sound from a TikTok that uses a popular song?',
    answer:
      'Technically yes — if the song is audible in the post, TikDL can save the audio track. Legally, the song is almost certainly copyrighted, and saving it does not grant you a licence to use it elsewhere. If you want to use a trending sound in your own content, the right approach is to use TikTok\'s in-app audio library, which clears the rights for TikTok use.',
  },
];

const webAppLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'TikDL — TikTok MP3 Downloader',
  url: `${SITE_URL}/tiktok-mp3-downloader`,
  description:
    'Free TikTok audio extractor. Save the audio track from any public TikTok post as an MP3 file at original bitrate. No signup, no recompression, works on every device.',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  browserRequirements: 'Requires a modern web browser with JavaScript enabled.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Extract TikTok audio as MP3',
    'Original bitrate, no recompression',
    'No signup or account required',
    'Works on iPhone, Android, tablet, and desktop',
  ],
};

const STEPS = [
  {
    icon: LinkIcon,
    title: 'Copy the TikTok link',
    desc: 'In the TikTok app, tap Share on the video and choose "Copy Link". Or copy the URL from a desktop browser.',
  },
  {
    icon: Zap,
    title: 'Paste and fetch in TikDL',
    desc: 'Paste the link into the input at the top of the TikDL homepage and press Download. After the brief countdown, the result card appears.',
  },
  {
    icon: Download,
    title: 'Switch to the Audio tab and save',
    desc: 'In the result card, tap the Audio tab and click Download Audio. The MP3 file is saved to your device.',
  },
];

export default function TikTokMp3DownloaderPage() {
  return (
    <SeoPage
      navbarPage="features"
      crumbs={crumbs}
      faqItems={faqItems}
      pageKey="tiktok-mp3-downloader"
      additionalJsonLd={[webAppLd]}
    >
      {/* ---- Hero / intro ---- */}
      <section className="pt-8 sm:pt-12 pb-6 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-14 h-14 bg-[#25F4EE] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5">
            <Music size={28} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Download TikTok Audio as <span className="text-[#25F4EE]">MP3</span>
          </h1>
          <p className="text-[#9CA3AF] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
            Save just the sound from any public TikTok — a trending audio clip, background music,
            or a creator&apos;s original voiceover. The MP3 is delivered at the original bitrate,
            with no recompression, no signup, and no app install.
          </p>
        </div>
      </section>

      {/* ---- What the audio workflow does ---- */}
      <section className="py-8 sm:py-10 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="glass rounded-[16px] p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">How the audio workflow works</h2>
            <p className="text-[#9CA3AF] leading-relaxed mb-3">
              Every TikTok video is published with two media tracks: the video stream and an
              audio stream. The audio stream is what you hear when the video plays — it can be a
              trending song licensed through TikTok&apos;s audio library, the creator&apos;s
              original voiceover, or a sound effect they added in the editor.
            </p>
            <p className="text-[#9CA3AF] leading-relaxed mb-3">
              When you paste a TikTok link into TikDL, the result card shows two tabs: Video and
              Audio. The Audio tab contains a direct Download Audio button that fetches just the
              audio stream as a standalone file. TikDL does not transcode or re-encode the audio
              — the file you save is the same audio track TikTok packaged with the original post.
            </p>
            <p className="text-[#9CA3AF] leading-relaxed">
              Most media players (VLC, Apple Music, Windows Media Player, Audacity, etc.) will
              open the file directly. The format is typically AAC inside an MP4 container, which
              is widely compatible; the .mp3 extension is used because that is what the file
              effectively is for playback purposes.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Step-by-step ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center">Step-by-step usage</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step) => (
              <div key={step.title} className="glass rounded-[16px] p-5 text-center">
                <div className="w-10 h-10 bg-[#25F4EE] rounded-xl flex items-center justify-center text-lg font-bold mx-auto mb-3">
                  <step.icon size={20} className="text-black" />
                </div>
                <h3 className="font-semibold text-base mb-2">{step.title}</h3>
                <p className="text-[#9CA3AF] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-6 text-sm">
            Never used TikDL before? The{' '}
            <Link href="/how-to-download-tiktok-videos" className="text-[#FE2C55] hover:underline">
              how to download TikTok videos
            </Link>{' '}
            guide walks through the full flow with device-specific notes.
          </p>
        </div>
      </section>

      {/* ---- Responsible use / copyright ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="glass rounded-[16px] p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2">
              <AlertCircle size={20} className="text-[#FE2C55]" />
              Responsible use &amp; copyright
            </h2>
            <p className="text-[#9CA3AF] leading-relaxed mb-3">
              Saving a TikTok audio clip for personal offline listening — for example, to hear a
              voice memo from a creator you follow on a flight — is generally fine. The audio
              file is the same one TikTok already served to your device when you watched the
              video; downloading it just lets you keep a copy.
            </p>
            <p className="text-[#9CA3AF] leading-relaxed mb-3">
              The line is redistribution. Most trending TikTok sounds are licensed music, and the
              licence covers use inside TikTok — not reuse in your own YouTube video, podcast,
              Spotify upload, or DJ set. Even when the sound is a creator&apos;s original work,
              they own the copyright; using their audio without permission is infringement. The
              fact that you removed it from the video does not change that.
            </p>
            <p className="text-[#9CA3AF] leading-relaxed">
              If you want to use a trending sound in your own TikTok content, the correct path is
              to use TikTok&apos;s in-app audio library, which clears the rights for use within
              TikTok. For a fuller discussion of when downloading TikTok content is and is not
              acceptable, see our page on{' '}
              <Link
                href="/is-it-legal-to-download-tiktok-videos"
                className="text-[#FE2C55] hover:underline"
              >
                whether it is legal to download TikTok videos
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* ---- Cross-links ---- */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto glass rounded-[16px] p-6 sm:p-8">
          <h2 className="text-lg sm:text-xl font-bold mb-3">Related TikDL features</h2>
          <p className="text-[#9CA3AF] text-sm leading-relaxed mb-4">
            Need the full video instead of just the audio? Want to save the images from a TikTok
            photo post? The same TikDL tool can do both.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/tiktok-no-watermark"
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors duration-150"
            >
              TikTok no-watermark video ↓
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
