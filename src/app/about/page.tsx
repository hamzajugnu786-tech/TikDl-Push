import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'About TikDL — Free TikTok Video Downloader Without Watermark',
  description: 'Learn about TikDL, the fastest free TikTok downloader. Save HD videos without watermarks, extract audio, and download cover images instantly. No signup, no limits.',
  openGraph: {
    title: 'About TikDL — Free TikTok Video Downloader',
    description: 'The fastest free TikTok downloader. Save HD videos without watermarks instantly.',
    url: 'https://tikdl.app/about',
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-14 h-14 bg-[#FE2C55] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5">♪</div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              About <span className="text-[#FE2C55]">TikDL</span>
            </h1>
            <p className="text-[#9CA3AF] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
              The fastest, most reliable TikTok downloader on the web. Save any public TikTok video without a watermark in full HD quality — completely free.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 bg-[#0a0a0a]">
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Our Mission</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">
                TikDL was built with a single goal: make downloading TikTok videos as simple and fast as possible. We believe that saving content for personal use should never require signing up for an account, installing suspicious software, or dealing with watermarks that degrade video quality. Every feature we ship is designed to remove friction from the download experience and deliver the highest-quality output available.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">
                Unlike many competing tools that redirect you through ad-laden pages, force account creation, or compress videos before download, TikDL fetches the original HD source directly from TikTok&#39;s servers. What you download is the exact same quality as what was uploaded — no re-encoding, no resolution downscaling, no added watermarks. This commitment to quality is what sets TikDL apart.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                We are continuously improving our service, adding support for photo posts and slideshows, extracting audio as MP3, downloading cover images, and ensuring that every download preserves the original filename and metadata. Our roadmap is driven entirely by user feedback — if there is a feature you want, let us know.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center">How TikDL Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { step: '1', title: 'Paste the Link', desc: 'Copy any public TikTok video URL and paste it into the input field on the homepage. TikDL accepts standard TikTok links from the app or website.' },
                { step: '2', title: 'Fetch & Process', desc: 'Our server queries the TikHub API to retrieve the original HD video source, audio track, and cover image — all without watermarks and in the highest available resolution.' },
                { step: '3', title: 'Download', desc: 'Choose your format: MP4 video without watermark, MP3 audio, or the cover image. Files are streamed directly to your device with the original title preserved.' },
              ].map((item) => (
                <div key={item.step} className="glass rounded-[16px] p-5 text-center">
                  <div className="w-10 h-10 bg-[#FE2C55] rounded-xl flex items-center justify-center text-lg font-bold mx-auto mb-3">{item.step}</div>
                  <h3 className="font-semibold text-base mb-2">{item.title}</h3>
                  <p className="text-[#9CA3AF] text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy Commitment */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 bg-[#0a0a0a]">
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Privacy & Safety</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">
                TikDL does not store, log, or redistribute any downloaded content. When you submit a TikTok URL, our server fetches the video metadata, streams it to your browser, and discards all server-side data immediately. We do not maintain a database of downloads, and we never associate your IP address with specific videos.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">
                We use industry-standard security practices: all connections are encrypted via HTTPS, our API routes are protected against SSRF attacks, and ad content is sanitized through DOMPurify to prevent XSS injection. Your browser history is the only record of your downloads — and even that can be cleared with one click.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                For full details on how we handle data, please review our <Link href="/privacy" className="text-[#FE2C55] hover:underline">Privacy Policy</Link> and <Link href="/terms" className="text-[#FE2C55] hover:underline">Terms of Service</Link>.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-10 sm:py-14 px-4 sm:px-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">Ready to try TikDL?</h2>
          <p className="text-[#9CA3AF] text-sm mb-5">It&#39;s free, unlimited, and requires no signup.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-[12px] font-semibold text-sm transition-colors duration-150"
          >
            Start Downloading
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
