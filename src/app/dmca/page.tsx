import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';
import { AdSlot } from '@/components/ad-slot';
import { Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'DMCA — Copyright Takedown Policy — TikDL',
  description: 'TikDL DMCA policy for copyright holders. Learn how to submit a valid takedown notice.',
  openGraph: { title: 'DMCA — TikDL', description: 'How to submit a DMCA takedown notice to TikDL.', url: 'https://tikdl.app/dmca' },
};

export default function DmcaPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar currentPage="dmca" />
      <div className="h-[52px]" />

      {/* ===== Ad Slot 1: Header banner ===== */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-2">
        <AdSlot page="dmca" placement="header_banner" />
      </div>

      <main className="flex-1">
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-14 h-14 bg-[#FE2C55] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5"><Shield size={28} /></div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">DMCA Takedown Policy</h1>
            <p className="text-[#9CA3AF] text-base leading-relaxed max-w-xl mx-auto">Last updated: August 2026. TikDL respects intellectual property rights and expects users to do the same.</p>
          </div>
        </section>

        {/* ===== Ad Slot 2: After intro ===== */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 my-3">
          <AdSlot page="dmca" placement="after_intro" />
        </div>

        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">1. Our Policy</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">TikDL responds to valid DMCA takedown notices. We take copyright seriously and will remove or disable access to material that is claimed to be infringing.</p>
              <p className="text-[#9CA3AF] leading-relaxed">TikDL does not host or store any downloaded content. We act as a conduit between TikTok and your browser. However, we cooperate with valid takedown requests within our capabilities.</p>
            </div>

            {/* ===== Ad Slot 3: Between content sections ===== */}
            <div className="py-1">
              <AdSlot page="dmca" placement="between_sections" />
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">2. How to Submit a DMCA Notice</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">If you are a copyright owner or authorized to act on one&apos;s behalf, send a written notice to our DMCA agent. Your notice must include:</p>
              <ul className="text-[#9CA3AF] text-sm leading-relaxed space-y-3 mb-4 list-decimal list-inside">
                <li><strong className="text-white">Identification of the copyrighted work</strong> — A description of the work you claim has been infringed.</li>
                <li><strong className="text-white">Identification of the infringing material</strong> — The TikTok URL(s) that link to the material.</li>
                <li><strong className="text-white">Your contact information</strong> — Name, mailing address, phone number, and email.</li>
                <li><strong className="text-white">Good faith statement</strong> — That you believe the use is not authorized by the copyright owner or the law.</li>
                <li><strong className="text-white">Statement under penalty of perjury</strong> — That the information is accurate and you are authorized to act on behalf of the copyright owner.</li>
                <li><strong className="text-white">Your signature</strong> — Physical or electronic (typing your full legal name suffices).</li>
              </ul>
              <p className="text-[#9CA3AF] leading-relaxed">Send your notice to: <strong className="text-white">dmca@tikdl.app</strong></p>
            </div>

            {/* ===== Ad Slot 4: Between content sections ===== */}
            <div className="py-1">
              <AdSlot page="dmca" placement="between_sections" />
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">3. Counter-Notification</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">If you believe your material was removed by mistake, you may submit a counter-notification including:</p>
              <ul className="text-[#9CA3AF] text-sm leading-relaxed space-y-2 mb-3 list-disc list-inside">
                <li>Identification of the removed material and where it appeared</li>
                <li>A statement under penalty of perjury that it was removed by mistake</li>
                <li>Your name, address, phone, and consent to jurisdiction</li>
                <li>Your signature</li>
              </ul>
              <p className="text-[#9CA3AF] leading-relaxed">Upon receipt, we will forward it to the original complainant and may restore the material after 10-14 business days.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">4. Important Notes</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">TikDL does not host any video content. All content is sourced from TikTok&apos;s public systems. We cannot remove content from TikTok — we can only restrict our service from processing specific URLs.</p>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">If you want content removed at its source, contact TikTok directly through their reporting mechanisms.</p>
              <p className="text-[#9CA3AF] leading-relaxed">Filing a DMCA notice is a legal statement. Under Section 512(f), knowingly misrepresenting material as infringing may subject you to liability for damages.</p>
            </div>
          </div>
        </section>

        {/* ===== Ad Slot 5: Above final CTA ===== */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 my-3">
          <AdSlot page="dmca" placement="above_cta" />
        </div>

        <section className="py-8 sm:py-10 px-4 sm:px-6 text-center bg-[#0a0a0a]">
          <p className="text-[#9CA3AF] text-sm mb-3">Non-copyright inquiries? <Link href="/contact" className="text-[#FE2C55] hover:underline">Contact us</Link>.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-[12px] font-semibold text-sm transition-colors duration-150">Back to TikDL</Link>
        </section>
      </main>

      {/* ===== Ad Slot 6: Above footer ===== */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-2">
        <AdSlot page="dmca" placement="above_footer" />
      </div>

      <SiteFooter />
    </div>
  );
}
