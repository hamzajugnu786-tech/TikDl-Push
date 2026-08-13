import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';
import ContentPageAds from '@/components/ContentPageAds';
import { Mail, MessageSquare, ExternalLink } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact TikDL — Get Help & Support',
  description: 'Contact the TikDL team for support, feedback, or feature requests. We typically respond within 24 hours.',
  alternates: { canonical: 'https://tikdl.app/contact' },
  openGraph: { title: 'Contact TikDL', description: 'Reach the TikDL team for support or feedback.', url: 'https://tikdl.app/contact' },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar currentPage="contact" />
      <div className="h-[52px]" />
      <main className="flex-1">
        <ContentPageAds page="contact">
        <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-14 h-14 bg-[#FE2C55] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5"><MessageSquare size={28} /></div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Contact <span className="text-[#FE2C55]">Us</span></h1>
            <p className="text-[#9CA3AF] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">Have a question, feedback, or bug report? We would love to hear from you.</p>
          </div>
        </section>

        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center">Get In Touch</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass rounded-[16px] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-[#FE2C55]/15 rounded-xl flex items-center justify-center"><Mail size={20} className="text-[#FE2C55]" /></div>
                  <h3 className="font-semibold text-base">Email Support</h3>
                </div>
                <p className="text-[#9CA3AF] text-sm leading-relaxed mb-3">For detailed inquiries, bug reports, or partnership proposals, send us an email. Include the TikTok URL you tried, the error message, and your browser.</p>
                <a href="mailto:support@tikdl.app" className="text-[#FE2C55] text-sm font-medium hover:underline inline-flex items-center gap-1">support@tikdl.app <ExternalLink size={12} /></a>
              </div>
              <div className="glass rounded-[16px] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-[#25F4EE]/15 rounded-xl flex items-center justify-center"><MessageSquare size={20} className="text-[#25F4EE]" /></div>
                  <h3 className="font-semibold text-base">Silbren.com</h3>
                </div>
                <p className="text-[#9CA3AF] text-sm leading-relaxed mb-3">For business inquiries or enterprise questions, reach out through Silbren.</p>
                <a href="https://silbren.com" target="_blank" rel="noopener noreferrer" className="text-[#25F4EE] text-sm font-medium hover:underline inline-flex items-center gap-1">silbren.com <ExternalLink size={12} /></a>
              </div>
            </div>
          </div>
        </section>

        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-[16px] p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Before You Reach Out</h2>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">Many common questions are answered on our FAQ. If your question is about supported formats, download limits, or watermark removal, check there first.</p>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">For technical issues, try: refresh the page, clear your browser cache, try a different browser, and ensure the TikTok video is publicly accessible. If the problem persists, include your browser version and the exact error message.</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/#faq" className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-[10px] text-sm font-medium transition-colors duration-150">View FAQ</Link>
                <Link href="/privacy" className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-[10px] text-sm font-medium text-gray-400 transition-colors duration-150">Privacy Policy</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center">What Are You Reaching Out About?</h2>
            <div className="space-y-3">
              {[
                { title: 'Bug Report', desc: 'Something is not working. Include the TikTok URL, expected behavior, and what actually happened.' },
                { title: 'Feature Request', desc: 'You have an idea for a new feature. Tell us what you want and why it matters.' },
                { title: 'General Question', desc: 'A question not covered in the FAQ. We are happy to help.' },
                { title: 'DMCA / Takedown', desc: 'You are a rights holder requesting content removal. Visit our DMCA page for the procedure.' },
              ].map((item) => (
                <div key={item.title} className="glass rounded-[12px] p-4 sm:p-5">
                  <h3 className="font-semibold text-sm sm:text-base mb-2">{item.title}</h3>
                  <p className="text-[#9CA3AF] text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-10 sm:py-14 px-4 sm:px-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">Need to download a video?</h2>
          <p className="text-[#9CA3AF] text-sm mb-5">Head back to the homepage.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-[12px] font-semibold text-sm transition-colors duration-150">Start Downloading</Link>
        </section>
        </ContentPageAds>
      </main>
      <SiteFooter />
    </div>
  );
}
