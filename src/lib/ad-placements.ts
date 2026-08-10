/**
 * Centralized Ad Placement Registry
 * ---------------------------------------------------------------
 * Single source of truth for all valid (page, placement) combinations.
 *
 * Used by:
 *  - Admin UI (filters Placement dropdown by selected Page)
 *  - Public API route /api/config/ads (validates incoming ?pages=)
 *  - Frontend AdSlot component (validates page+placement props at dev time)
 *
 * To add a new page or placement in the future, ONLY this file needs editing.
 * No schema migration required — the DB columns `page` and `placement` are
 * free-form strings. The admin UI SELECT options come from this registry.
 */

export interface PageDef {
  id: string;
  label: string;
  desc: string;
  /** True if this page renders ad slots today */
  active: boolean;
}

export interface PlacementDef {
  id: string;
  label: string;
  desc: string;
  /**
   * Pages where this placement is renderable. '*' means "all current and future pages".
   * Page IDs that appear in this array (or '*' inclusion) are selectable in the admin UI.
   */
  pages: string[] | '*';
}

/**
 * PAGE_KEYS — catalog of pages that support ad rendering.
 *
 * Adding a new page here automatically makes it available in the admin UI's Page dropdown
 * — no schema migration, no API change, no frontend code change required.
 */
export const PAGE_KEYS: PageDef[] = [
  { id: 'homepage', label: 'Homepage', desc: 'Main landing/download page', active: true },
  { id: 'about',    label: 'About',    desc: 'About TikDL page',          active: true },
  { id: 'contact',  label: 'Contact',  desc: 'Contact page',              active: true },
  { id: 'privacy',  label: 'Privacy',  desc: 'Privacy Policy page',       active: true },
  { id: 'terms',    label: 'Terms',    desc: 'Terms of Service page',     active: true },
  { id: 'dmca',     label: 'DMCA',    desc: 'DMCA Takedown Policy page', active: true },
  { id: 'all',      label: 'All Pages',desc: 'Show on every page that renders ads', active: true },
];

/**
 * PLACEMENT_KEYS — catalog of all ad slot positions.
 *
 * Each placement declares which pages it can render on. New placements
 * are automatically picked up by the admin UI Placement dropdown.
 */
export const PLACEMENT_KEYS: PlacementDef[] = [
  // ===== Homepage-only placements (existing) =====
  {
    id: 'hero_section',
    label: 'Hero Section',
    desc: 'Inside the hero / download area on homepage',
    pages: ['homepage'],
  },
  {
    id: 'between_url_download',
    label: 'Between URL & Download',
    desc: 'Between input field and download button (homepage)',
    pages: ['homepage'],
  },
  {
    id: 'between_result_recent',
    label: 'Between Result & Recent',
    desc: 'Between download result and Recent Downloads (homepage)',
    pages: ['homepage'],
  },
  {
    id: 'between_recent_features',
    label: 'Between Recent & Features',
    desc: 'Between Recent Downloads and How To Use (homepage)',
    pages: ['homepage'],
  },
  {
    id: 'between_features_faq',
    label: 'Between Features & FAQ',
    desc: 'Between How To Use and FAQ sections (homepage)',
    pages: ['homepage'],
  },
  {
    id: 'left_sidebar',
    label: 'Left Desktop Sidebar',
    desc: 'Left sidebar (desktop only, homepage)',
    pages: ['homepage'],
  },
  {
    id: 'right_sidebar',
    label: 'Right Desktop Sidebar',
    desc: 'Right sidebar (desktop only, homepage)',
    pages: ['homepage'],
  },
  {
    id: 'interstitial_popup',
    label: 'Interstitial Popup',
    desc: 'Inside the countdown popup modal (homepage)',
    pages: ['homepage'],
  },
  {
    id: 'native_content',
    label: 'Native Content',
    desc: 'Blends with page content (homepage)',
    pages: ['homepage'],
  },
  {
    id: 'history_interval',
    label: 'Recent Downloads Interval',
    desc: 'Rendered after every 4 history cards (homepage)',
    pages: ['homepage'],
  },

  // ===== Shared placements (homepage + all content pages) =====
  {
    id: 'header_banner',
    label: 'Header Banner',
    desc: 'Top of page, below the navbar',
    pages: '*',
  },
  {
    id: 'above_footer',
    label: 'Above Footer',
    desc: 'Bottom banner, before the footer',
    pages: '*',
  },

  // ===== Content-page placements (new) =====
  {
    id: 'after_intro',
    label: 'After Intro Section',
    desc: 'Between the page intro/hero and the first content section',
    pages: ['about', 'contact', 'privacy', 'terms', 'dmca'],
  },
  {
    id: 'between_sections',
    label: 'Between Content Sections',
    desc: 'Generic slot between major content sections',
    pages: ['about', 'contact', 'privacy', 'terms', 'dmca'],
  },
  {
    id: 'above_cta',
    label: 'Above Final CTA',
    desc: 'Just before the final call-to-action section',
    pages: ['about', 'contact', 'privacy', 'terms', 'dmca'],
  },
];

/**
 * Validity check — true if the (page, placement) tuple is permitted by the registry.
 * The 'all' page id is always valid (treated as cross-page assignment).
 */
export function isValidAdTarget(page: string, placement: string): boolean {
  // 'all' is a valid cross-page assignment — accept any placement that allows any page
  if (page === 'all') {
    return PLACEMENT_KEYS.some(p => p.id === placement);
  }
  const placementDef = PLACEMENT_KEYS.find(p => p.id === placement);
  if (!placementDef) return false;
  if (placementDef.pages === '*') return true;
  return placementDef.pages.includes(page);
}

/**
 * Placements available for a given page id. Used by admin UI to populate the Placement dropdown
 * after a Page is selected. For 'all', every placement is selectable.
 */
export function getPlacementsForPage(page: string): PlacementDef[] {
  if (page === 'all') return PLACEMENT_KEYS;
  return PLACEMENT_KEYS.filter(p => p.pages === '*' || (Array.isArray(p.pages) && p.pages.includes(page)));
}

/**
 * Placements available for the homepage specifically. Used to keep the existing
 * /api/config/ads landing-ads response shape backwards compatible.
 */
export const HOMEPAGE_PLACEMENTS = PLACEMENT_KEYS
  .filter(p => p.pages === '*' || (Array.isArray(p.pages) && p.pages.includes('homepage')))
  .map(p => p.id);

/**
 * All known page ids (excluding the synthetic 'all').
 */
export const PAGE_IDS = PAGE_KEYS.filter(p => p.id !== 'all').map(p => p.id);
