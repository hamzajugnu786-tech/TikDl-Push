import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';
import ContentPageAds from '@/components/ContentPageAds';

export const metadata: Metadata = {
  title: 'Terms of Service — TikDL',
  description: 'TikDL terms of service. Understand the rules governing your use of TikDL.',
  openGraph: { title: 'Terms of Service — TikDL', description: 'Terms governing use of TikDL.', url: 'https://tikdl.app/terms' },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar currentPage="terms" />
      <div className="h-[52px]" />
      <main className="flex-1">
        <ContentPageAds page="terms">
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Terms of Service</h1>
            <p className="text-[#9CA3AF] text-base leading-relaxed max-w-xl mx-auto">Last updated: August 2026. By using TikDL, you agree to these terms.</p>
          </div>
        </section>

        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">1. Acceptance of Terms</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">By accessing or using TikDL, you agree to be bound by these Terms. If you do not agree, do not use the service.</p>
              <p className="text-[#9CA3AF] leading-relaxed">We may modify these Terms at any time. Your continued use after changes constitutes acceptance.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">2. Description of Service</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">TikDL is a web-based tool that allows users to download publicly available TikTok videos without watermarks. Users can save videos in HD quality or extract audio.</p>
              <p className="text-[#9CA3AF] leading-relaxed">The service is provided &quot;as is&quot; without warranties. Availability depends on the public availability of the requested content.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">3. Acceptable Use</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">You agree to use TikDL only for lawful purposes. Specifically, you agree not to:</p>
              <ul className="text-[#9CA3AF] text-sm leading-relaxed space-y-2 mb-3 list-disc list-inside">
                <li>Download content from private accounts without the owner&apos;s consent</li>
                <li>Redistribute or sell downloaded content without authorization</li>
                <li>Violate copyright laws or TikTok&apos;s terms of service</li>
                <li>Use automated tools to make excessive requests</li>
                <li>Attempt to exploit or tamper with the service</li>
              </ul>
              <p className="text-[#9CA3AF] leading-relaxed">TikDL is designed for personal, non-commercial use. You are responsible for ensuring your use complies with applicable laws.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">4. Intellectual Property</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">All downloaded content belongs to its original creators. TikDL does not claim ownership. Removing a watermark does not transfer any intellectual property rights to you.</p>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">The TikDL name, logo, and website design are our intellectual property.</p>
              <p className="text-[#9CA3AF] leading-relaxed">If you are a rights holder, see our <Link href="/dmca" className="text-[#FE2C55] hover:underline">DMCA page</Link>.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">5. Disclaimers</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">TikDL is not affiliated with, endorsed by, or connected to TikTok or ByteDance. All TikTok trademarks remain the property of their respective owners.</p>
              <p className="text-[#9CA3AF] leading-relaxed">To the maximum extent permitted by law, we disclaim all warranties and are not liable for any damages arising from your use of the service.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">6. Termination</h2>
              <p className="text-[#9CA3AF] leading-relaxed">We may suspend or terminate access for conduct that violates these Terms or is harmful to other users. Provisions that by their nature survive termination shall survive.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">7. Governing Law</h2>
              <p className="text-[#9CA3AF] leading-relaxed">These Terms are governed by the laws of the United States. Disputes shall be resolved through good-faith negotiation and, if necessary, binding arbitration.</p>
            </div>
          </div>
        </section>

        <section className="py-8 sm:py-10 px-4 sm:px-6 text-center">
          <p className="text-[#9CA3AF] text-sm mb-3">Questions? <Link href="/contact" className="text-[#FE2C55] hover:underline">Contact us</Link>.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-[12px] font-semibold text-sm transition-colors duration-150">Back to TikDL</Link>
        </section>
        </ContentPageAds>
      </main>
      <SiteFooter />
    </div>
  );
}
