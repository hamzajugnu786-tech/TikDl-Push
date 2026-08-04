import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Privacy Policy — TikDL',
  description: 'TikDL privacy policy. We do not store downloads or log personal information. Your privacy is our priority.',
  openGraph: { title: 'Privacy Policy — TikDL', description: 'How TikDL handles your data. We do not store downloads.', url: 'https://tikdl.app/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar />
      <div className="h-[52px]" />
      <main className="flex-1">
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Privacy Policy</h1>
            <p className="text-[#9CA3AF] text-base leading-relaxed max-w-xl mx-auto">Last updated: August 2026. Your privacy is critically important to us.</p>
          </div>
        </section>

        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">1. What We Collect</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">TikDL does not require an account. We collect no personal information by default. The TikTok URL you submit is used solely to fetch the video and is not stored after the request completes.</p>
              <p className="text-[#9CA3AF] leading-relaxed">When you download a file, it is delivered directly to your browser in real-time. We never keep copies of downloaded videos, audio, or images on our end.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">2. What We Do NOT Collect</h2>
              <ul className="text-[#9CA3AF] text-sm leading-relaxed space-y-2 mb-3 list-disc list-inside">
                <li>Your name, email, or any account credentials</li>
                <li>The TikTok URLs you submit</li>
                <li>Downloaded files</li>
                <li>Tracking cookies for ad targeting</li>
                <li>Any personally identifiable information</li>
              </ul>
              <p className="text-[#9CA3AF] leading-relaxed">Your download history is saved only in your browser and never leaves your device. You can clear it anytime.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">3. Cookies & Local Storage</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">TikDL uses your browser&apos;s local storage to save your recent download history so you can quickly revisit past downloads. This stays on your device and is never sent to us.</p>
              <p className="text-[#9CA3AF] leading-relaxed">We do not use tracking cookies, advertising cookies, or analytics cookies that profile you across websites.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">4. Third-Party Services</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">When you submit a URL, your request is forwarded to a third-party service that retrieves the video data from TikTok. Their privacy policy governs how they handle request data.</p>
              <p className="text-[#9CA3AF] leading-relaxed">Ads displayed on TikDL are served through our own system. Ad networks may have their own cookie practices, which are governed by their respective privacy policies. We do not share user data with advertisers.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">5. Data Security</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">All connections to TikDL are encrypted, ensuring your data cannot be intercepted in transit. We take reasonable measures to protect the service from common security threats.</p>
              <p className="text-[#9CA3AF] leading-relaxed">We follow the principle of least privilege and regularly review our security posture.</p>
            </div>

            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">6. Your Rights</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">Because we collect minimal personal data, most data rights are inherently satisfied. You can clear your local download history at any time.</p>
              <p className="text-[#9CA3AF] leading-relaxed">This policy may be updated periodically. Continued use of TikDL after updates constitutes acceptance of the revised policy.</p>
            </div>
          </div>
        </section>

        <section className="py-8 sm:py-10 px-4 sm:px-6 text-center bg-[#0a0a0a]">
          <p className="text-[#9CA3AF] text-sm mb-3">Questions? <Link href="/contact" className="text-[#FE2C55] hover:underline">Contact us</Link>.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-[12px] font-semibold text-sm transition-colors duration-150">Back to TikDL</Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
