'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

interface SiteNavbarProps {
  /** If true, show the refresh button and use hash links for home anchors */
  isHome?: boolean;
  /** Currently active page — used to highlight the active link in TikTok Red */
  currentPage?: 'home' | 'features' | 'faq' | 'history' | 'about' | 'contact' | 'privacy' | 'terms' | 'dmca' | 'tools';
}

// Default branding — used before /api/config/settings loads or if DB is empty
const DEFAULT_BRANDING = {
  siteName: 'TikDL',
  logoText: 'TikDL',
  primaryColor: '#FE2C55',
};

// Primary navigation items — every item is reachable with ONE click on every
// viewport. Desktop shows them inline; mobile renders the same list inside a
// horizontally scrollable strip (no hamburger, no sidebar, no wrap).
//
// `kind: 'anchor'` items are in-page anchors on the homepage (#features, …).
// On non-home pages they navigate to `/#features` etc. so the user always
// lands on the right section. `kind: 'page'` items are real routes.
interface NavItem {
  key: NonNullable<SiteNavbarProps['currentPage']>;
  label: string;
  kind: 'anchor' | 'page';
  hash?: string;
  href?: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'features', label: 'How To Use', kind: 'anchor', hash: '#features' },
  { key: 'faq', label: 'FAQ', kind: 'anchor', hash: '#faq' },
  { key: 'history', label: 'History', kind: 'anchor', hash: '#history' },
  { key: 'about', label: 'About', kind: 'page', href: '/about' },
  { key: 'contact', label: 'Contact', kind: 'page', href: '/contact' },
  { key: 'privacy', label: 'Privacy', kind: 'page', href: '/privacy' },
  { key: 'terms', label: 'Terms', kind: 'page', href: '/terms' },
  { key: 'dmca', label: 'DMCA', kind: 'page', href: '/dmca' },
];

export default function SiteNavbar({ isHome = false, currentPage }: SiteNavbarProps) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  // Refs to each nav-item DOM node, keyed by item.key. Used to auto-scroll
  // the active item into the visible horizontal viewport after navigation.
  // Without this, when a user manually scrolls the navbar to a far-right
  // item (e.g. DMCA) and clicks it, the navbar's horizontal scroll position
  // is preserved on the new page but the active item may sit off-screen —
  // making it look like the navbar "lost" the active page.
  const itemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch DB-backed site branding on mount (client-side fetch, no static caching)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/config/settings', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled || !data?.success) return;
        const s = data.settings || {};
        setBranding({
          siteName: s.siteName || DEFAULT_BRANDING.siteName,
          logoText: s.logoText || s.siteName || DEFAULT_BRANDING.logoText,
          primaryColor: s.primaryColor || DEFAULT_BRANDING.primaryColor,
        });
      } catch {
        // Use defaults
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ===== Auto-scroll the active nav item into the visible horizontal viewport.
  //
  // Why: When the user manually scrolls the navbar strip to reach a far-right
  // page (e.g. DMCA) and clicks it, Next.js performs a client-side navigation.
  // The navbar DOM is rebuilt on the new page, but the browser preserves the
  // scroll position of the strip from the previous render — so the newly-active
  // item may sit just out of view, making it look like the navbar "reset" and
  // the active page disappeared.
  //
  // Fix: After every navigation (currentPage change), find the active item's
  // DOM node and call scrollIntoView with `inline: 'nearest'` so it slides
  // smoothly into view without resetting the entire strip to position 0.
  // `block: 'nearest'` ensures we don't trigger any vertical page scroll.
  useEffect(() => {
    if (!currentPage) return;
    // Defer one frame so the new active item's ref is registered before we
    // attempt to scroll it. Without rAF, the ref map may still hold the
    // previous page's DOM node.
    const raf = requestAnimationFrame(() => {
      const node = itemRefs.current.get(currentPage);
      if (node && scrollContainerRef.current) {
        // Use scrollIntoView with `nearest` so we only scroll if the item is
        // actually outside the visible viewport. If the item is already
        // visible (the common case for the first few items), this is a no-op
        // and preserves the user's manual scroll position.
        node.scrollIntoView({
          behavior: 'smooth',
          inline: 'nearest',
          block: 'nearest',
        });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [currentPage]);

  // Build the href for an anchor item: in-page hash on the homepage, /#hash elsewhere.
  const anchorHref = (hash: string) => (isHome ? hash : `/${hash}`);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 flex items-center gap-3">
        {/* ===== Branding — always visible, never scrolls away ===== */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold" style={{ backgroundColor: branding.primaryColor }}>♪</div>
            <span className="font-bold text-lg tracking-tighter">{branding.logoText}</span>
          </Link>
          {isHome && (
            <button
              onClick={() => window.location.reload()}
              className="ml-1 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150"
              title="Refresh page"
              aria-label="Refresh page"
            >
              <RefreshCw size={14} className="text-gray-400 hover:text-white transition-colors" />
            </button>
          )}
        </div>

        {/* ===== Horizontally scrollable page nav — one tap to any page =====
            - overflow-x-auto so items never wrap to a second row
            - scroll-smooth for native smooth horizontal swipe
            - hidden scrollbar (webkit + firefox) so the strip looks clean
            - touch-pan-x preserves natural mobile swipe
            - flex-shrink-0 on items so they keep their natural width
            - left edge fade so it's obvious the strip scrolls
        */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-w-0 overflow-x-auto scroll-smooth touch-pan-x site-nav-scroll"
          style={{
            scrollbarWidth: 'none', // Firefox
            msOverflowStyle: 'none', // IE/Edge
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="flex items-center gap-1 min-w-max pr-2">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPage === item.key;
              const href = item.kind === 'anchor' ? anchorHref(item.hash!) : item.href!;
              const cls = `flex-shrink-0 px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? 'shadow-[0_4px_14px_rgba(254,44,85,0.35)]'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`;
              // Force text color via INLINE STYLE so it always wins over any
              // inherited stylesheet rule. Tailwind v4 utilities are emitted
              // into a CSS cascade layer, which means a non-layered rule in
              // globals.css like `body { color: #ffffff; }` silently overrides
              // `.text-black` even though both have the same specificity.
              // Inline styles are not subject to cascade layers, so they
              // reliably win — guaranteeing black text on the active item.
              const style: React.CSSProperties = isActive
                ? { backgroundColor: branding.primaryColor, color: '#000000' }
                : {};

              // Register the item's DOM node in the ref map so the
              // auto-scroll useEffect can find it after navigation.
              const setRef = (el: HTMLAnchorElement | null) => {
                if (el) {
                  itemRefs.current.set(item.key, el);
                } else {
                  itemRefs.current.delete(item.key);
                }
              };

              if (item.kind === 'anchor') {
                return (
                  <a
                    key={item.key}
                    href={href}
                    ref={setRef}
                    className={cls}
                    style={style}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                );
              }
              return (
                <Link
                  key={item.key}
                  href={href}
                  ref={setRef}
                  className={cls}
                  style={style}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
