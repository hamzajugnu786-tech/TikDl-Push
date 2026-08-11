'use client';

/**
 * ContentPageAds — wraps a content page's main content and renders AdSlots
 * at standard positions: top (header_banner), after-intro, between-sections,
 * before-cta, and above-footer.
 *
 * AUTO-INJECTION DESIGN
 * ====================
 * The wrapper uses React.Children.toArray to enumerate top-level <section>
 * elements passed as children. It then renders ad slots:
 *   - Before the first section  → header_banner
 *   - After the first section    → after_intro
 *   - Between the middle two sections → between_sections
 *   - Before the last section    → before_cta  (treated as CTA section)
 *   - After the last section     → above_footer
 *
 * If the page has fewer sections than the standard model, the extra slots
 * are simply skipped — never rendered, never crash.
 *
 * NEW PAGE SUPPORT
 * ================
 * A developer creating a new content page wraps their <main> with:
 *
 *   <ContentPageAds page="blog">
 *     <section>...</section>
 *     <section>...</section>
 *     <section>...</section>
 *   </ContentPageAds>
 *
 * The page then auto-appears in the admin Advertisement Management Center
 * (via the filesystem scan in /api/config/pages) and ads saved for that
 * page key render automatically — no per-page AdSlot placement required.
 *
 * PERFORMANCE
 * ===========
 * Ads are fetched once via useAdsForPage(pageKey) and shared across all
 * AdSlot instances in this wrapper. The fetch is non-blocking — the page
 * renders fully first, then ads fill in as the fetch resolves.
 */

import { Children, type ReactNode } from 'react';
import AdSlot from './AdSlot';

export interface ContentPageAdsProps {
  /** Page key — must match a known content page (about/contact/privacy/etc.). */
  page: string;
  /** The page's <section> children — ad slots are inserted between them. */
  children: ReactNode;
}

export default function ContentPageAds({ page, children }: ContentPageAdsProps) {
  // Collect only top-level <section> elements — leave other nodes (divs,
  // text, etc.) in place. This makes the wrapper forgiving: a content
  // page that wraps its <main> content with ContentPageAds gets ad slots
  // between its sections automatically.
  const sections = Children.toArray(children).filter(child => {
    return (
      child !== null &&
      typeof child === 'object' &&
      'type' in child &&
      (child as any).type === 'section'
    );
  });

  const count = sections.length;

  // Build the interleaved output: section[0], ad, section[1], ad, ...
  // The ad slot positions depend on the section count.
  const output: ReactNode[] = [];

  // 1) Header banner — only if 2+ sections (above the first section)
  if (count >= 2) {
    output.push(
      <div key="ad-header" className="tikdl-ad-wrapper my-4 px-4 sm:px-6">
        <AdSlot page={page} placement="header_banner" />
      </div>
    );
  }

  sections.forEach((section, i) => {
    output.push(section);

    // 2) After intro (after section[0]) — only if 2+ sections remain
    if (i === 0 && count >= 3) {
      output.push(
        <div key="ad-after-intro" className="tikdl-ad-wrapper my-4 px-4 sm:px-6">
          <AdSlot page={page} placement="after_intro" />
        </div>
      );
    }

    // 3) Between sections — once in the middle of the page.
    //
    // Bug fix: previously required `count >= 4`, which silently excluded
    // 3-section content pages (Privacy, Terms, DMCA) from rendering any
    // global `between_sections` ad. A global ad MUST render on every page
    // that supports the placement.
    //
    // New behavior — preserves existing position on 4+ section pages so
    // About/Contact (5 sections) keep rendering the ad after section[1],
    // exactly as before:
    //   count === 3: render after section[1] (NEW — previously not rendered)
    //                Note: this is the same position as `before_cta`; two
    //                ad slots at the same position is acceptable because
    //                they target DIFFERENT placements (between_sections
    //                vs before_cta) and AdSlot picks the winner per
    //                placement independently.
    //   count === 4: render after section[1] (UNCHANGED)
    //   count === 5: render after section[1] (UNCHANGED)
    //   count  >= 6: render after section[Math.floor(count/2) - 1] (UNCHANGED)
    const betweenSectionsAfter =
      count >= 4 ? Math.floor(count / 2) - 1  // 4 → 1, 5 → 1, 6 → 2, 7 → 2 …
      : count === 3 ? 1                       // 3 → 1 (middle of 3 sections)
      : -1;                                    // <3 sections → no slot
    if (i === betweenSectionsAfter) {
      output.push(
        <div key="ad-between" className="tikdl-ad-wrapper my-4 px-4 sm:px-6">
          <AdSlot page={page} placement="between_sections" />
        </div>
      );
    }

    // 4) Before CTA — before the last section (treat last section as CTA)
    if (i === count - 2 && count >= 3) {
      output.push(
        <div key="ad-before-cta" className="tikdl-ad-wrapper my-4 px-4 sm:px-6">
          <AdSlot page={page} placement="before_cta" />
        </div>
      );
    }
  });

  // 5) Above footer — after the last section
  if (count >= 2) {
    output.push(
      <div key="ad-above-footer" className="tikdl-ad-wrapper my-4 px-4 sm:px-6">
        <AdSlot page={page} placement="above_footer" />
      </div>
    );
  }

  // If no sections were detected, just render children as-is — the page
  // still works, it just won't have auto-injected ads.
  if (count === 0) {
    return <>{children}</>;
  }

  return <>{output}</>;
}
