import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';
import { Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'DMCA — Copyright Takedown Policy — TikDL',
  description: 'TikDL DMCA takedown policy for copyright holders. Learn how to submit a valid DMCA takedown notice and how we process infringement claims.',
  openGraph: {
    title: 'DMCA — Copyright Takedown Policy — TikDL',
    description: 'How to submit a DMCA takedown notice to TikDL.',
    url: 'https://tikdl.app/dmca',
  },
};

export default function DmcaPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-14 h-14 bg-[#FE2C55] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5">
              <Shield size={28} />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">DMCA Takedown Policy</h1>
            <p className="text-[#9CA3AF] text-base leading-relaxed max-w-xl mx-auto">
              Last updated: August 2026. TikDL respects the intellectual property rights of others and expects its users to do the same.
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Section 1 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">1. Our Policy</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                It is TikDL&#39;s policy to respond to clear notices of alleged copyright infringement that comply with the Digital Millennium Copyright Act (&quot;DMCA&quot;). We take copyright concerns seriously and will expeditiously remove or disable access to material that is claimed to be infringing. Repeat infringers may have their access to the Service terminated permanently.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                Importantly, TikDL does not store or host any downloaded content on our servers. We act as a conduit between TikTok&#39;s public CDN and the user&#39;s browser. However, we are committed to cooperating with valid takedown requests and will take appropriate action within our technical capabilities.
              </p>
            </div>

            {/* Section 2 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">2. How to Submit a DMCA Takedown Notice</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                If you are a copyright owner or authorized to act on behalf of one, and you believe that your copyrighted work is being accessed through TikDL in a way that constitutes copyright infringement, please send a written notice to our designated DMCA agent. Your notice must include all of the following elements to be considered valid:
              </p>
              <ul className="text-[#9CA3AF] text-sm leading-relaxed space-y-3 mb-4 list-decimal list-inside">
                <li>
                  <strong className="text-white">Identification of the copyrighted work</strong> — A description of the copyrighted work that you claim has been infringed. If multiple works are involved, provide a representative list.
                </li>
                <li>
                  <strong className="text-white">Identification of the infringing material</strong> — The specific TikTok URL(s) that link to the material you claim is infringing. Include enough detail for us to locate the material.
                </li>
                <li>
                  <strong className="text-white">Your contact information</strong> — Your full legal name, mailing address, telephone number, and email address so that we can contact you regarding your claim.
                </li>
                <li>
                  <strong className="text-white">Statement of good faith</strong> — A statement that you have a good faith belief that the use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.
                </li>
                <li>
                  <strong className="text-white">Statement under penalty of perjury</strong> — A statement that the information in the notice is accurate, and that you are authorized to act on behalf of the owner of the copyright that is allegedly infringed.
                </li>
                <li>
                  <strong className="text-white">Physical or electronic signature</strong> — Your physical or electronic signature (typing your full legal name is sufficient for electronic notices).
                </li>
              </ul>
              <p className="text-[#9CA3AF] leading-relaxed">
                Send your complete DMCA notice to: <strong className="text-white">dmca@tikdl.app</strong>
              </p>
            </div>

            {/* Section 3 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">3. Counter-Notification</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                If you believe that your material was removed or disabled as a result of a mistake or misidentification, you may submit a counter-notification. Your counter-notification must include:
              </p>
              <ul className="text-[#9CA3AF] text-sm leading-relaxed space-y-2 mb-3 list-disc list-inside">
                <li>Identification of the material that was removed or disabled and the location where it previously appeared</li>
                <li>A statement under penalty of perjury that you have a good faith belief that the material was removed as a result of mistake or misidentification</li>
                <li>Your name, address, telephone number, and a statement consenting to jurisdiction in federal court for the judicial district in which you reside</li>
                <li>Your physical or electronic signature</li>
              </ul>
              <p className="text-[#9CA3AF] leading-relaxed">
                Upon receipt of a valid counter-notification, we will forward it to the original complaining party and may restore the removed material after 10-14 business days unless the copyright owner files a court action.
              </p>
            </div>

            {/* Section 4 */}
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold mb-4">4. Important Notes</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                TikDL does not host or store any video content. All content accessed through our Service is sourced directly from TikTok&#39;s public content delivery network. Our Service functions as a technical tool that facilitates access to publicly available data, similar to a web browser. We do not have the ability to remove content from TikTok&#39;s servers — we can only restrict our Service from processing specific URLs.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed mb-3">
                If you wish to have content removed at its source, you should contact TikTok directly through their copyright reporting mechanisms. Restricting access through TikDL only prevents our Service from processing the URL; it does not affect the content&#39;s availability on TikTok itself.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                Filing a DMCA notice constitutes a legal statement. Under Section 512(f) of the DMCA, any person who knowingly materially misrepresents that material or activity is infringing may be subject to liability for damages. Please ensure that your claim is valid before submitting a notice.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-8 sm:py-10 px-4 sm:px-6 text-center bg-[#0a0a0a]">
          <p className="text-[#9CA3AF] text-sm mb-3">
            For non-copyright inquiries, visit our <Link href="/contact" className="text-[#FE2C55] hover:underline">contact page</Link>.
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
