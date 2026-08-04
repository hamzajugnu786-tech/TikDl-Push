import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Terms of Service — TikDL',
  description: 'TikDL terms of service. Understand the rules governing your use of TikDL, including acceptable use, intellectual property, disclaimers, and limitations of liability.',
  openGraph: {
    title: 'Terms of Service — TikDL',
    description: 'Terms governing use of TikDL. Read before using the service.',
    url: 'https://tikdl.app/terms',
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Terms of Service</h1>
            <p className="text-[#9CA3AF] text-base leading-relaxed max-w-xl mx-auto">
              Last updated: August 2026. By using TikDL, you agree to these terms. Please read them carefully before using the service.
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Section 1 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">1. Acceptance of Terms</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                By accessing or using TikDL (the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to all of these Terms, you must not use the Service. These Terms apply to all visitors, users, and others who access or use the Service, regardless of how they access it.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                We reserve the right to modify these Terms at any time. We will update the &quot;Last updated&quot; date at the top of this page when changes are made. Your continued use of the Service after any such modification constitutes your acceptance of the revised Terms. It is your responsibility to review these Terms periodically for changes.
              </p>
            </div>

            {/* Section 2 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">2. Description of Service</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                TikDL is a web-based tool that allows users to download publicly available TikTok videos without watermarks. The Service retrieves video metadata from the TikHub API, which queries TikTok&#39;s public data endpoints. Users can download videos in MP4 format (with or without watermark), extract audio as MP3, and save cover images.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied. We do not guarantee that the Service will be uninterrupted, timely, secure, or error-free. The availability and quality of downloaded content depends on TikTok&#39;s servers and the public availability of the requested content.
              </p>
            </div>

            {/* Section 3 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">3. Acceptable Use</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                You agree to use TikDL only for lawful purposes and in accordance with these Terms. Specifically, you agree not to:
              </p>
              <ul className="text-[#9CA3AF] text-sm leading-relaxed space-y-2 mb-3 list-disc list-inside">
                <li>Use the Service to download content from private or restricted TikTok accounts without the owner&#39;s consent</li>
                <li>Redistribute, sell, or commercially exploit downloaded content without proper authorization from the original creator</li>
                <li>Use the Service for any purpose that violates applicable copyright laws, intellectual property rights, or TikTok&#39;s Terms of Service</li>
                <li>Attempt to reverse engineer, decompile, or otherwise tamper with the Service&#39;s infrastructure or API</li>
                <li>Use automated scripts, bots, or scrapers to make excessive requests that could degrade Service performance for other users</li>
                <li>Submit URLs that are not valid TikTok video links or that attempt to exploit security vulnerabilities</li>
              </ul>
              <p className="text-[#9CA3AF] leading-relaxed">
                TikDL is designed for personal, non-commercial use. Downloading publicly available content for offline personal viewing is generally considered fair use in many jurisdictions, but you are responsible for ensuring that your use complies with the laws applicable in your jurisdiction.
              </p>
            </div>

            {/* Section 4 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">4. Intellectual Property</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                All content downloaded through TikDL belongs to its original creators. TikDL does not claim ownership of any downloaded videos, audio, or images. The watermark removal feature strips TikTok&#39;s platform watermark from the video file, but this does not transfer any intellectual property rights to the user.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                The TikDL name, logo, website design, and source code are the intellectual property of Silbren.com and are protected by applicable copyright and trademark laws. You may not use our branding or trademarks without written permission.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                If you are a content creator or rights holder and believe that TikDL is being used to infringe on your intellectual property, please refer to our <Link href="/dmca" className="text-[#FE2C55] hover:underline">DMCA page</Link> for instructions on submitting a takedown notice.
              </p>
            </div>

            {/* Section 5 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">5. Disclaimers & Limitation of Liability</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                TikDL is not affiliated with, endorsed by, or connected to TikTok, ByteDance, or any of their subsidiaries. All TikTok trademarks, logos, and content remain the property of their respective owners. Our Service is an independent third-party tool.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                To the maximum extent permitted by law, TikDL and its operators disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. We are not liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the Service, including but not limited to damages for loss of data, revenue, or profits.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                In no event shall our total liability to you for all claims arising out of or relating to the Service exceed the amount of one US dollar ($1.00) or the amount you paid to use the Service (which is zero for free users), whichever is greater.
              </p>
            </div>

            {/* Section 6 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">6. Termination</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                We reserve the right to terminate or suspend access to the Service immediately, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties. Because TikDL does not require accounts, termination typically takes the form of IP-level rate limiting or blocking for abusive behavior.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                Upon termination, your right to use the Service ceases immediately. Provisions of these Terms that by their nature should survive termination shall survive, including intellectual property provisions, disclaimers, and limitation of liability clauses.
              </p>
            </div>

            {/* Section 7 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">7. Governing Law</h2>
              <p className="text-[#9CA3AF] leading-relaxed">
                These Terms are governed by and construed in accordance with the laws of the United States. Any disputes arising out of or relating to these Terms or the Service shall be resolved through good-faith negotiation, and if negotiation fails, through binding arbitration in accordance with the rules of the American Arbitration Association. You agree to waive any right to participate in class action lawsuits or class-wide arbitration.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-8 sm:py-10 px-4 sm:px-6 text-center bg-[#0a0a0a]">
          <p className="text-[#9CA3AF] text-sm mb-3">
            Questions about these terms? <Link href="/contact" className="text-[#FE2C55] hover:underline">Contact us</Link>.
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
