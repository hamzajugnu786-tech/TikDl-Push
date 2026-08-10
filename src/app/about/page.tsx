import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';
import { AdSlot } from '@/components/ad-slot';

export const metadata: Metadata = {
  title: 'About TikDL — Free TikTok Video Downloader',
  description: 'TikDL is the fastest free TikTok downloader. Save HD videos without watermarks instantly. No signup, no limits.',
  openGraph: { title: 'About TikDL', description: 'The fastest free TikTok downloader.', url: 'https://tikdl.app/about' },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar currentPage="about" />
      <div className="h-[52px]" />

      {/* ===== Ad Slot 1: Header banner (below navbar) ===== */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-2">
        <AdSlot page="about" placement="header_banner" />
      </div>

      <main className="flex-1">
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-14 h-14 bg-[#FE2C55] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5">♪</div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">About <span className="text-[#FE2C55]">TikDL</span></h1>
            <p className="text-[#9CA3AF] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">The fastest, most reliable TikTok downloader on the web. Save any public TikTok video without a watermark in full HD quality — completely free.</p>
          </div>
        </section>

        {/* ===== Ad Slot 2: After intro / mission section ===== */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 my-3">
          <AdSlot page="about" placement="after_intro" />
        </div>

        <section className="py-8 sm:py-12 px-4 sm:px-6 bg-[#0a0a0a]">
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Our Mission</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">TikDL was built with a single goal: make downloading TikTok videos as simple and fast as possible. We believe saving content for personal use should never require creating an account, installing software, or dealing with watermarks that degrade quality. Every feature we ship removes friction and delivers the highest-quality output available.</p>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">Unlike many tools that redirect you through ad-laden pages or compress videos, TikDL delivers the original HD source directly. What you download is the exact same quality as what was uploaded — no re-encoding, no resolution loss, no added watermarks.</p>
              <p className="text-[#9CA3AF] leading-relaxed">We continuously improve TikDL, adding support for photo posts, extracting audio, and ensuring filenames are preserved. Our roadmap is driven by user feedback — if there is a feature you want, let us know.</p>
            </div>
          </div>
        </section>

        {/* ===== Ad Slot 3: Between major sections ===== */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 my-3">
          <AdSlot page="about" placement="between_sections" />
        </div>

        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { step: '1', title: 'Paste the Link', desc: 'Copy any public TikTok video URL and paste it into TikDL.' },
                { step: '2', title: 'We Fetch It', desc: 'TikDL retrieves the original HD video and audio instantly.' },
                { step: '3', title: 'You Download', desc: 'Choose your format and save — video, audio, or original images.' },
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

        {/* ===== Ad Slot 4: Between How It Works and Privacy & Safety ===== */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 my-3">
          <AdSlot page="about" placement="between_sections" />
        </div>

        <section className="py-8 sm:py-12 px-4 sm:px-6 bg-[#0a0a0a]">
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Privacy & Safety</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">TikDL does not store, log, or redistribute any downloaded content. When you submit a URL, we fetch the video and deliver it to you — nothing is saved on our end. We never associate you with specific downloads.</p>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">All connections are encrypted. Your browser history is the only record of your downloads, and you can clear it with one click.</p>
              <p className="text-[#9CA3AF] leading-relaxed">For full details, see our <Link href="/privacy" className="text-[#FE2C55] hover:underline">Privacy Policy</Link> and <Link href="/terms" className="text-[#FE2C55] hover:underline">Terms of Service</Link>.</p>
            </div>
          </div>
        </section>

        {/* ===== Ad Slot 5: Above final CTA ===== */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 my-3">
          <AdSlot page="about" placement="above_cta" />
        </div>

        <section className="py-10 sm:py-14 px-4 sm:px-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">Ready to try TikDL?</h2>
          <p className="text-[#9CA3AF] text-sm mb-5">Free, unlimited, no signup.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-[12px] font-semibold text-sm transition-colors duration-150">Start Downloading</Link>
        </section>
      </main>

      {/* ===== Ad Slot 6: Above footer ===== */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-2">
        <AdSlot page="about" placement="above_footer" />
      </div>

      <SiteFooter />
    </div>
  );
}
