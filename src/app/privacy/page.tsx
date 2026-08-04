import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Privacy Policy — TikDL',
  description: 'TikDL privacy policy. Learn how we handle your data, what information we collect, and your rights. We do not store downloads or associate IPs with videos.',
  openGraph: {
    title: 'Privacy Policy — TikDL',
    description: 'How TikDL handles your data. We do not store downloads or log personal information.',
    url: 'https://tikdl.app/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Privacy Policy</h1>
            <p className="text-[#9CA3AF] text-base leading-relaxed max-w-xl mx-auto">
              Last updated: August 2026. Your privacy is critically important to us. This policy explains what data TikDL collects, how we use it, and your rights.
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Section 1 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">1. Information We Collect</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                TikDL operates with a minimal-data philosophy. We do not require account creation, and we collect virtually no personal information by default. The only data that touches our servers is the TikTok URL you submit, which we use solely to fetch video metadata and download links from the TikHub API. This URL is processed in real-time and is not stored in any database or log after the request completes.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                When you download a file, our proxy server temporarily streams the content from TikTok&#39;s CDN to your browser. The streamed data is not cached on our servers — it passes through in real-time and is discarded immediately after delivery. We never store copies of downloaded videos, audio, or images.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                Anonymous analytics may be collected to monitor service health, including aggregate request counts and error rates. These metrics contain no personally identifiable information and cannot be linked back to individual users or specific downloads.
              </p>
            </div>

            {/* Section 2 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">2. Information We Do NOT Collect</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                We want to be explicit about what we do not collect, because we believe transparency builds trust. TikDL does not collect or store any of the following:
              </p>
              <ul className="text-[#9CA3AF] text-sm leading-relaxed space-y-2 mb-3 list-disc list-inside">
                <li>Your email address, name, or any account credentials</li>
                <li>Your IP address associated with specific download requests</li>
                <li>The TikTok URLs you submit (processed and discarded in real-time)</li>
                <li>Downloaded video, audio, or image files</li>
                <li>Browser fingerprinting data or tracking cookies for ad targeting</li>
                <li>Any form of personally identifiable information (PII)</li>
              </ul>
              <p className="text-[#9CA3AF] leading-relaxed">
                Your download history is stored exclusively in your browser&#39;s localStorage and never leaves your device. You can clear this history at any time using the &quot;Clear history&quot; button on the homepage. Clearing your browser data also removes this history completely.
              </p>
            </div>

            {/* Section 3 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">3. Cookies & Local Storage</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                TikDL uses localStorage to save your recent download history (video title, author, and thumbnail URL) so that you can quickly re-access previously downloaded content. This data is stored entirely on your device and is never transmitted to our servers. localStorage persists across browser sessions but can be cleared through your browser settings or our &quot;Clear history&quot; button.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                We do not use tracking cookies, advertising cookies, or any third-party analytics cookies. Any cookies present are essential for the functioning of the website (such as session tokens for the admin panel) and are not used for tracking or profiling visitors.
              </p>
            </div>

            {/* Section 4 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">4. Third-Party Services</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                TikDL integrates with TikHub API to fetch TikTok video data. When you submit a URL, your request is forwarded to TikHub, which retrieves the video metadata from TikTok&#39;s public API. TikHub&#39;s own privacy policy governs how they handle request data. We encourage you to review their practices if you have concerns about this intermediary step.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                Ad content displayed on TikDL is served through our own ad management system and is sanitized via DOMPurify to prevent malicious script execution. Ad networks may have their own cookie and tracking practices, which are governed by their respective privacy policies. We minimize third-party tracking and do not share any user data with advertisers.
              </p>
            </div>

            {/* Section 5 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">5. Data Security</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                All connections to TikDL are encrypted via HTTPS/TLS 1.3, ensuring that data in transit cannot be intercepted or tampered with. Our API routes implement SSRF (Server-Side Request Forgery) protection through an explicit host whitelist, and all ad content is sanitized before rendering to prevent XSS attacks.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                Our infrastructure runs on Vercel&#39;s serverless platform, which provides automatic DDoS protection, edge caching, and SOC 2 Type II compliance. We follow the principle of least privilege in all server-side operations and regularly review our security posture.
              </p>
            </div>

            {/* Section 6 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">6. Your Rights</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                Because we collect minimal personal data, most data rights (access, correction, deletion) are inherently satisfied. You have the right to clear your local download history at any time. If you believe any data has been inadvertently collected and wish to request its deletion, please contact us at support@tikdl.app and we will respond within 30 days.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                This policy may be updated periodically to reflect changes in our practices or regulatory requirements. We will update the &quot;Last updated&quot; date at the top of this page whenever material changes are made. Continued use of TikDL after such updates constitutes acceptance of the revised policy.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-8 sm:py-10 px-4 sm:px-6 text-center bg-[#0a0a0a]">
          <p className="text-[#9CA3AF] text-sm mb-3">
            Questions about our privacy practices? <Link href="/contact" className="text-[#FE2C55] hover:underline">Contact us</Link>.
          </p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-[12px] font-semibold text-sm transition-colors duration-150">
            Back to TikDL
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
