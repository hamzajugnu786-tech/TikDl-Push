/**
 * Centralized Advertisement Registry
 * =================================
 *
 * The single source of truth for the entire ad system: pages, sections,
 * placements, templates, dimensions. Used by:
 *   - Admin UI (Advertisement Management Center — page tabs, section groups)
 *   - Public ads API (resolution: section → page → global → none)
 *   - AdSlot / ContentPageAds components (runtime rendering)
 *
 * AUTOMATIC PAGE DISCOVERY
 * ------------------------
 * KNOWN_PAGES below provides friendly labels for built-in pages. New pages
 * are also discovered dynamically at runtime by scanning the filesystem
 * (src/app/<dir>/page.tsx) AND by inspecting distinct `page` values stored
 * in the AdPlacement table. This means:
 *
 *   1. A developer creates `src/app/blog/page.tsx` → it auto-appears in the
 *      admin page tabs (filesystem scan).
 *   2. The admin types a custom page key like "campaign-x" and saves an ad →
 *      that key auto-appears in the admin page tabs (DB scan).
 *
 * No code change is required when a new page is added.
 *
 * GLOBAL / PAGE / SECTION FALLBACK MODEL
 * --------------------------------------
 * Resolution order when rendering an ad slot at (page=P, section=S):
 *   1. Ad with page=P AND placement=S (section-specific)
 *   2. Ad with page=P AND placement=S (any enabled ad for that section)
 *   3. Ad with page="all" AND placement=S (global default for that section)
 *   4. No ad rendered (slot omitted — never crashes the page)
 *
 * This means a single "Above Footer" ad with page="all" renders on EVERY
 * page that has an above_footer slot, while a page-specific ad overrides it.
 */

// ============================================================================
// PAGE REGISTRY (display labels only — discovery is dynamic)
// ============================================================================

export interface PageMeta {
  /** Stable page key — matches the route slug (e.g. "about" → /about) */
  key: string
  /** Friendly label shown in the admin page tabs */
  label: string
  /** True for the homepage (special — has rich legacy ad slots) */
  isHomepage?: boolean
}

/**
 * Built-in pages with friendly labels. The homepage is always index 0.
 * Custom pages discovered at runtime are appended after these.
 */
export const KNOWN_PAGES: PageMeta[] = [
  { key: 'homepage', label: 'Home', isHomepage: true },
  { key: 'about',    label: 'About' },
  { key: 'contact',  label: 'Contact' },
  { key: 'privacy',  label: 'Privacy' },
  { key: 'terms',    label: 'Terms' },
  { key: 'dmca',     label: 'DMCA' },
]

/**
 * Special page key meaning "render on every page" — used as the global
 * fallback bucket. Ads saved with page="all" render on every page that
 * has the matching placement slot, unless overridden by a page-specific ad.
 */
export const GLOBAL_PAGE_KEY = 'all'

// ============================================================================
// SECTION / PLACEMENT REGISTRY
// ============================================================================

export interface PlacementMeta {
  /** Stable placement id — stored in AdPlacement.placement */
  id: string
  /** Friendly label shown in admin section headings */
  label: string
  /** Short description for admin help text */
  desc: string
  /** Which pages this placement is eligible on (omit = all pages) */
  pages?: string[]
}

/**
 * Universal placements — available on EVERY page (homepage + content pages).
 * These are the "standard placement concepts" the product owner specified:
 *   HEADER / HERO, AFTER INTRO, BETWEEN SECTIONS, ABOVE CTA, ABOVE FOOTER.
 *
 * Content pages (about/contact/privacy/terms/dmca) auto-inject these slots
 * via the ContentPageAds component — no manual <AdSlot> placement required.
 */
export const UNIVERSAL_PLACEMENTS: PlacementMeta[] = [
  { id: 'header_banner',     label: 'Header / Hero',     desc: 'Top of page, above the hero section' },
  { id: 'after_intro',       label: 'After Intro',       desc: 'Directly after the first content section' },
  { id: 'between_sections',  label: 'Between Sections',   desc: 'Mid-content placement between major sections' },
  { id: 'before_cta',        label: 'Above CTA',          desc: 'Just before the final call-to-action button' },
  { id: 'above_footer',      label: 'Above Footer',       desc: 'Bottom banner before the site footer' },
]

/**
 * Homepage-only placements — these are the legacy homepage ad slots that
 * MUST be preserved with zero regression. They are NOT auto-injected on
 * content pages. The homepage JSX renders them explicitly.
 */
export const HOMEPAGE_ONLY_PLACEMENTS: PlacementMeta[] = [
  { id: 'hero_section',            label: 'Hero Section',              desc: 'Inside the hero/download area', pages: ['homepage'] },
  { id: 'between_url_download',    label: 'Between URL & Download',    desc: 'Between input field and download button', pages: ['homepage'] },
  { id: 'between_result_recent',   label: 'Between Result & Recent',   desc: 'After download result, before Recent Downloads', pages: ['homepage'] },
  { id: 'between_recent_features', label: 'Between Recent & Features', desc: 'After Recent Downloads, before How To Use', pages: ['homepage'] },
  { id: 'between_features_faq',    label: 'Between Features & FAQ',    desc: 'Between How To Use and FAQ sections', pages: ['homepage'] },
  { id: 'native_content',          label: 'Native Content',            desc: 'Blends with page content naturally', pages: ['homepage'] },
  { id: 'left_sidebar',            label: 'Left Desktop Sidebar',      desc: 'Left sidebar ad (desktop only)', pages: ['homepage'] },
  { id: 'right_sidebar',           label: 'Right Desktop Sidebar',     desc: 'Right sidebar ad (desktop only)', pages: ['homepage'] },
  { id: 'interstitial_popup',      label: 'Interstitial Popup',        desc: 'Inside the countdown popup modal', pages: ['homepage'] },
  { id: 'history_interval',        label: 'Recent Downloads Interval', desc: 'Auto-inserted every 4 cards in Recent Downloads', pages: ['homepage'] },
]

/** All placements — universal + homepage-only. Used by admin to show all options. */
export const ALL_PLACEMENTS: PlacementMeta[] = [...UNIVERSAL_PLACEMENTS, ...HOMEPAGE_ONLY_PLACEMENTS]

/**
 * Returns the placements eligible for a given page.
 * Homepage gets universal + homepage-only.
 * Content pages get universal only.
 */
export function placementsForPage(pageKey: string): PlacementMeta[] {
  if (pageKey === 'homepage') return ALL_PLACEMENTS
  return UNIVERSAL_PLACEMENTS
}

// ============================================================================
// AD TEMPLATES & DIMENSIONS (preserved from screenshots)
// ============================================================================

export interface AdTemplate {
  id: string
  label: string
  dimensions: string
  placement: string
  desc: string
}

/**
 * Built-in ad templates — preserved exactly from the supplied screenshots.
 * DO NOT remove or rename existing templates — admin-saved ads reference
 * these IDs.
 */
export const AD_TEMPLATES: AdTemplate[] = [
  { id: 'mobile_banner',     label: '📱 Mobile Banner',     dimensions: '320x100',    placement: 'header_banner',     desc: 'Compact banner optimized for mobile screens. Best for header or footer placement.' },
  { id: 'medium_rectangle',  label: '🖼️ Medium Rectangle', dimensions: '300x250',    placement: 'interstitial_popup', desc: 'The most common ad size. Versatile for popups, sidebars, and inline placements.' },
  { id: 'large_rectangle',   label: '📏 Large Rectangle',  dimensions: '336x280',    placement: 'interstitial_popup', desc: 'Slightly larger than medium rectangle. Higher visibility for important placements.' },
  { id: 'leaderboard',       label: '🖥️ Leaderboard',      dimensions: '728x90',     placement: 'header_banner',     desc: 'Wide horizontal banner ideal for header placement on desktop.' },
  { id: 'large_leaderboard', label: '🎯 Large Leaderboard', dimensions: '970x250',   placement: 'header_banner',     desc: 'Premium large banner for maximum desktop visibility.' },
  { id: 'half_page',         label: '📐 Half Page',        dimensions: '300x600',    placement: 'right_sidebar',     desc: 'Tall vertical ad perfect for sidebar placement.' },
  { id: 'skyscraper',        label: '🏢 Skyscraper',       dimensions: '160x600',    placement: 'right_sidebar',     desc: 'Slim vertical ad designed for sidebar placement.' },
  { id: 'billboard',         label: '📺 Billboard',        dimensions: '970x90',     placement: 'header_banner',     desc: 'Wide horizontal banner for desktop header placement.' },
  { id: 'responsive_banner', label: '🌐 Responsive Banner', dimensions: 'responsive', placement: 'native_content',    desc: 'Fluid ad that adapts to any container width. Best for flexible layouts.' },
  { id: 'interstitial',       label: '🎯 Interstitial',     dimensions: '300x250',    placement: 'interstitial_popup', desc: 'Full-screen overlay ad shown during the countdown popup.' },
  { id: 'native_ad',          label: '📰 Native Ad',       dimensions: 'responsive', placement: 'native_content',     desc: 'Content-integrated ad that blends naturally with the page layout.' },
]

/**
 * All supported ad dimension strings — preserved from the screenshots.
 * Used by the dimensions dropdown in the admin UI.
 */
export const AD_DIMENSIONS: Array<{ value: string; label: string }> = [
  { value: '320x100',    label: '320 × 100 (Mobile Banner)' },
  { value: '300x250',    label: '300 × 250 (Medium Rectangle)' },
  { value: '336x280',    label: '336 × 280 (Large Rectangle)' },
  { value: '728x90',     label: '728 × 90 (Leaderboard)' },
  { value: '970x250',    label: '970 × 250 (Large Leaderboard)' },
  { value: '300x600',    label: '300 × 600 (Half Page)' },
  { value: '160x600',    label: '160 × 600 (Skyscraper)' },
  { value: '970x90',     label: '970 × 90 (Billboard)' },
  { value: 'responsive', label: 'Responsive' },
]

export const AD_TYPES = [
  { value: 'display', label: 'Display' },
  { value: 'video',   label: 'Video' },
  { value: 'native',  label: 'Native' },
] as const

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get a friendly label for a page key. Falls back to Title Case for unknown
 * pages (e.g. "blog-post" → "Blog Post").
 */
export function pageLabel(pageKey: string): string {
  const known = KNOWN_PAGES.find(p => p.key === pageKey)
  if (known) return known.label
  if (pageKey === GLOBAL_PAGE_KEY) return 'Global (All Pages)'
  // Title Case fallback for custom / dynamically-discovered pages
  return pageKey
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Get a friendly label for a placement id.
 */
export function placementLabel(placementId: string): string {
  return ALL_PLACEMENTS.find(p => p.id === placementId)?.label
    ?? placementId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Parse a dimension string into numeric width/height.
 * "300x250" → { w: 300, h: 250 }
 * "responsive" → { w: 300, h: 150 } (default preview size)
 */
export function parseDimensions(dimStr: string): { w: number; h: number } {
  if (!dimStr || dimStr === 'responsive' || dimStr === 'native') return { w: 300, h: 150 }
  const parts = dimStr.split('x')
  return { w: parseInt(parts[0]) || 300, h: parseInt(parts[1]) || 250 }
}
