import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';
import ContentPageAds from '@/components/ContentPageAds';

export const metadata: Metadata = {
  title: 'Tools — TikDL',
  description: 'TikDL tools — helper page. Also used as a built-in test for the auto-discovery of new pages by the Advertisement Management Center.',
};

/**
 * /tools — Demo Page
 * ============================================================
 * This page exists to PROVE that the Advertisement Management
 * Center auto-discovers newly created pages without manual
 * registry edits. It is intentionally minimal — not a feature.
 *
 * How the auto-discovery works:
 *   1. `scripts/discover-pages.js` runs at build time and scans
 *      `src/app/<dir>/page.tsx`, writing the list of page keys
 *      to `src/lib/discovered-pages.json`.
 *   2. `/api/config/pages` reads that JSON at runtime and exposes
 *      the keys to the admin UI.
 *   3. The admin sees a "Tools" tab appear automatically in the
 *      Advertisement Management Center — no code change to the
 *      admin panel, ad-registry, or API required.
 *   4. Because this page is wrapped in <ContentPageAds page="tools">,
 *      any ad saved with `page=tools + placement=header_banner` (etc.)
 *      renders automatically.
 *
 * This pattern is the template for any future content page.
 */
export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <SiteNavbar />
      <div className="h-[52px]" />
      <main className="flex-1">
        <ContentPageAds page="tools">
          <section className="pt-12 sm:pt-16 pb-8 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <div className="w-14 h-14 bg-[#FE2C55] rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-5">🛠️</div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Tools</h1>
              <p className="text-[#9CA3AF] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
                Helper page. Also serves as a built-in test for the auto-discovery of new pages
                by the Advertisement Management Center — the admin should see a <strong>Tools</strong> tab
                appear automatically without any code change.
              </p>
            </div>
          </section>

          <section className="py-8 sm:py-12 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
              <div className="glass rounded-[16px] p-6 sm:p-8">
                <h2 className="text-xl sm:text-2xl font-bold mb-4">Auto-Discovery Test</h2>
                <p className="text-[#9CA3AF] leading-relaxed mb-4">
                  This page is wrapped in <code className="text-[#25F4EE]">&lt;ContentPageAds page=&quot;tools&quot;&gt;</code>,
                  which means ads saved with <code className="text-[#25F4EE]">page=tools</code> render
                  here automatically at the standard placements (header banner, after intro,
                  between sections, before CTA, above footer).
                </p>
                <p className="text-[#9CA3AF] leading-relaxed">
                  The build-time discovery script scans <code className="text-[#25F4EE]">src/app/&lt;dir&gt;/page.tsx</code>
                  and writes the list of page keys to <code className="text-[#25F4EE]">src/lib/discovered-pages.json</code>,
                  which the admin&apos;s page-tabs API reads at runtime. New pages appear in the
                  Advertisement Management Center with zero admin code changes.
                </p>
              </div>
            </div>
          </section>

          <section className="py-10 sm:py-14 px-4 sm:px-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-[12px] font-semibold text-sm transition-colors duration-150"
            >
              Back to Home
            </Link>
          </section>
        </ContentPageAds>
      </main>
      <SiteFooter />
    </div>
  );
}
