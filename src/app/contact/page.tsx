import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';
import { Mail, MessageSquare, ExternalLink } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact TikDL — Get Help & Support',
  description: 'Contact the TikDL team for support, feedback, bug reports, or feature requests. We typically respond within 24 hours.',
  openGraph: {
    title: 'Contact TikDL — Get Help & Support',
    description: 'Reach the TikDL team for support, feedback, or feature requests.',
    url: 'https://tikdl.app/contact',
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-14 h-14 bg-[#FE2C55] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5">
              <MessageSquare size={28} />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Contact <span className="text-[#FE2C55]">Us</span>
            </h1>
            <p className="text-[#9CA3AF] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
              Have a question, feedback, or bug report? We would love to hear from you. Our team typically responds within 24 hours.
            </p>
          </div>
        </section>

        {/* Contact Methods */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 bg-[#0a0a0a]">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center">Get In Touch</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email */}
              <div className="glass rounded-[16px] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-[#FE2C55]/15 rounded-xl flex items-center justify-center">
                    <Mail size={20} className="text-[#FE2C55]" />
                  </div>
                  <h3 className="font-semibold text-base">Email Support</h3>
                </div>
                <p className="text-[#9CA3AF] text-sm leading-relaxed mb-3">
                  For detailed inquiries, bug reports, or partnership proposals, send us an email. Include as much detail as possible — the TikTok URL you tried, the error message you saw, and the browser or device you are using. This helps us diagnose and fix issues quickly.
                </p>
                <a
                  href="mailto:support@tikdl.app"
                  className="text-[#FE2C55] text-sm font-medium hover:underline inline-flex items-center gap-1"
                >
                  support@tikdl.app <ExternalLink size={12} />
                </a>
              </div>

              {/* Silbren */}
              <div className="glass rounded-[16px] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-[#25F4EE]/15 rounded-xl flex items-center justify-center">
                    <MessageSquare size={20} className="text-[#25F4EE]" />
                  </div>
                  <h3 className="font-semibold text-base">Silbren.com</h3>
                </div>
                <p className="text-[#9CA3AF] text-sm leading-relaxed mb-3">
                  TikDL is powered by Silbren.com. For business inquiries, enterprise licensing, or integration support, reach out through the Silbren website. Our parent company handles all commercial and partnership communications.
                </p>
                <a
                  href="https://silbren.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#25F4EE] text-sm font-medium hover:underline inline-flex items-center gap-1"
                >
                  silbren.com <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Referral */}
        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Before You Reach Out</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">
                Many common questions are already answered on our FAQ page. If your question is about supported formats, download limits, how watermark removal works, or what to do when a video shows as unavailable, you will likely find the answer there. Checking the FAQ first saves you time and helps us keep our inbox clear for unique issues.
              </p>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">
                If you are experiencing a technical issue, try these steps before contacting us: refresh the page, clear your browser cache, try a different browser, and ensure the TikTok video is publicly accessible (not private or region-locked). If the problem persists after these steps, please include your browser version and the exact error message in your report.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/#faq"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-[10px] text-sm font-medium transition-colors duration-150"
                >
                  View FAQ
                </Link>
                <Link
                  href="/privacy"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-[10px] text-sm font-medium text-gray-400 transition-colors duration-150"
                >
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Report Categories */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 bg-[#0a0a0a]">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center">What Are You Reaching Out About?</h2>
            <div className="space-y-3">
              {[
                { title: 'Bug Report', desc: 'Something is not working as expected. Include the TikTok URL, expected behavior, and what actually happened. Screenshots help enormously — attach them to your email for the fastest resolution.' },
                { title: 'Feature Request', desc: 'You have an idea for a new feature or improvement. We prioritize features based on user demand, so detailed requests with use-case examples get the most attention. Tell us what you want and why it matters.' },
                { title: 'General Question', desc: 'You have a question that is not covered in the FAQ. Whether it is about compatibility with a specific device, bulk downloading, or how watermark removal works technically, we are happy to explain.' },
                { title: 'DMCA / Takedown', desc: 'You are a rights holder requesting content removal. Please visit our DMCA page for the specific procedure and required information. We process valid takedown notices promptly.' },
              ].map((item) => (
                <div key={item.title} className="glass rounded-[12px] p-4 sm:p-5">
                  <h3 className="font-semibold text-sm sm:text-base mb-2">{item.title}</h3>
                  <p className="text-[#9CA3AF] text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-10 sm:py-14 px-4 sm:px-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">Need to download a video?</h2>
          <p className="text-[#9CA3AF] text-sm mb-5">Head back to the homepage and paste your TikTok link.</p>
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
