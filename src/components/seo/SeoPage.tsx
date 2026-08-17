import type { Metadata } from 'next';
import Link from 'next/link';
import { type ReactNode } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';
import ContentPageAds from '@/components/ContentPageAds';
import { SITE_URL } from '@/lib/site-config';

// ============================================================================
// SeoPage — shared content-page shell for the Stage 3 SEO foundation.
// ============================================================================
//
// Purpose:
//   Provides a single, consistent wrapper for the new feature/informational
//   pages added in Stage 3 (no-watermark, mp3, how-to, photo, legal). Each
//   of those pages supplies:
//     - page-specific <Metadata> via Next's per-page export
//     - a `navbarPage` key (matches existing SiteNavbar currentPage union)
//     - a `crumbs` array (visible + BreadcrumbList JSON-LD)
//     - an optional `faqItems` array (renders a visible FAQ accordion AND
//       emits a FAQPage JSON-LD block — single source of truth)
//     - an optional `additionalJsonLd` array for page-specific schema
//       (WebApplication / HowTo / Article)
//     - the page's <section> children — passed through <ContentPageAds>
//       so the existing ad auto-injection keeps working without per-page
//       configuration.
//
// Design notes:
//   - NO 'use client' directive. The new pages are Server Components so
//     their content lands in the initial SSR HTML (better for crawlers and
//     for users on slow connections). The only client-side islands are the
//     existing SiteNavbar / SiteFooter / ContentPageAds which already
//     carry their own 'use client'.
//   - Visible breadcrumb <nav> uses the same TikDL dark theme tokens
//     (#9CA3AF muted, #FE2C55 brand) as the rest of the site so the new
//     pages look native, not bolted-on.
//   - BreadcrumbList JSON-LD is emitted for EVERY page that uses SeoPage.
//     The visible breadcrumb and the JSON-LD are driven by the same
//     `crumbs` array, so they cannot drift out of sync.
//   - FAQPage JSON-LD is emitted ONLY when `faqItems` is non-empty. The
//     visible FAQ accordion and the JSON-LD are driven by the same array.
// ============================================================================

export interface Crumb {
  /** Visible breadcrumb label. */
  label: string;
  /** URL for clickable crumbs. Omit on the final (current-page) crumb. */
  href?: string;
}

export interface SeoFaqItem {
  question: string;
  answer: string;
}

interface SeoPageProps {
  /** Matches SiteNavbar's currentPage union so the active pill highlights. */
  navbarPage: 'features' | 'faq' | 'history' | 'about' | 'contact' | 'privacy' | 'terms' | 'dmca' | 'tools';
  /** Breadcrumb chain, e.g. [{label:'Home', href:'/'}, {label:'TikTok No Watermark'}]. */
  crumbs: Crumb[];
  /** When provided, renders a visible FAQ section + emits FAQPage JSON-LD. */
  faqItems?: SeoFaqItem[];
  /** Optional heading for the FAQ section (defaults to "Frequently Asked Questions"). */
  faqTitle?: string;
  /** Page key for ContentPageAds auto-injection. Must match the directory name. */
  pageKey: string;
  /** Additional JSON-LD blocks (e.g. WebApplication, HowTo, Article) — emitted verbatim. */
  additionalJsonLd?: Record<string, unknown>[];
  /** The page's <section> children. */
  children: ReactNode;
}

export default function SeoPage({
  navbarPage,
  crumbs,
  faqItems,
  faqTitle = 'Frequently Asked Questions',
  pageKey,
  additionalJsonLd = [],
  children,
}: SeoPageProps) {
  // ---- BreadcrumbList JSON-LD (mirrors visible crumbs exactly) ----
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href
        ? { item: c.href.startsWith('http') ? c.href : `${SITE_URL}${c.href === '/' ? '' : c.href}` }
        : {}),
    })),
  };

  // ---- FAQPage JSON-LD (only when visible FAQs exist) ----
  const faqLd =
    faqItems && faqItems.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.answer,
            },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      {/* ---- Structured data (JSON-LD) ---- */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}
      {additionalJsonLd.map((block, i) => (
        <script
          key={`ld-extra-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}

      <SiteNavbar currentPage={navbarPage} />
      <div className="h-[52px]" />

      <main className="flex-1">
        {/* ---- Visible breadcrumb nav (mirrors BreadcrumbList JSON-LD) ---- */}
        <nav aria-label="Breadcrumb" className="max-w-3xl mx-auto px-4 sm:px-6 pt-4">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
            {crumbs.map((c, i) => (
              <li key={`crumb-${i}`} className="inline-flex items-center gap-1.5">
                {c.href ? (
                  <Link href={c.href} className="hover:text-white transition-colors duration-150">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-gray-300" aria-current="page">{c.label}</span>
                )}
                {i < crumbs.length - 1 && <ChevronRight size={12} className="text-gray-600" />}
              </li>
            ))}
          </ol>
        </nav>

        <ContentPageAds page={pageKey}>
          {children}

          {/* ---- Optional FAQ section (visible + already-emitted JSON-LD) ---- */}
          {faqItems && faqItems.length > 0 && (
            <section className="py-8 sm:py-12 px-4 sm:px-6" id="faq">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-xl sm:text-2xl font-bold mb-5">{faqTitle}</h2>
                <div className="space-y-3">
                  {faqItems.map((item, i) => (
                    <details key={`faq-${i}`} className="group glass rounded-[12px] p-4">
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium list-none">
                        <span className="pr-4">{item.question}</span>
                        <ChevronDown
                          size={14}
                          className="text-gray-400 shrink-0 group-open:rotate-180 transition-transform duration-200"
                        />
                      </summary>
                      <p className="text-[#9CA3AF] text-sm leading-relaxed mt-3">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ---- Universal CTA back to the downloader ---- */}
          <section className="py-8 sm:py-12 px-4 sm:px-6 text-center">
            <h2 className="text-lg sm:text-xl font-bold mb-3">Ready to download?</h2>
            <p className="text-[#9CA3AF] text-sm mb-5">Open TikDL and paste your TikTok link — no signup, no app install.</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-[12px] font-semibold text-sm transition-colors duration-150"
            >
              Open TikDL Downloader
            </Link>
          </section>
        </ContentPageAds>
      </main>
      <SiteFooter />
    </div>
  );
}

// ============================================================================
// Helper: build per-page <Metadata> for new SEO pages with less boilerplate.
// ============================================================================

interface SeoMetadataInput {
  title: string;
  description: string;
  /** Path beginning with '/', e.g. '/tiktok-no-watermark'. */
  path: string;
  /** Optional OG image override; defaults to the site icon. */
  ogImage?: string;
}

export function seoMetadata({ title, description, path, ogImage }: SeoMetadataInput): Metadata {
  const canonical = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      siteName: 'TikDL',
      images: [{
        url: ogImage || '/icon-512.png',
        width: ogImage ? 1200 : 512,
        height: ogImage ? 630 : 512,
        alt: title,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage || '/icon-512.png'],
    },
    robots: { index: true, follow: true },
  };
}
