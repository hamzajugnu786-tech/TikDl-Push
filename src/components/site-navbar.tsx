'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Menu, X } from 'lucide-react';

interface SiteNavbarProps {
  /** If true, show the refresh button and use hash links for home anchors */
  isHome?: boolean;
  /** Currently active page — used to highlight the active link in TikTok Red */
  currentPage?: 'home' | 'features' | 'faq' | 'history' | 'about' | 'contact' | 'privacy' | 'terms' | 'dmca';
}

// Default branding — used before /api/config/settings loads or if DB is empty
const DEFAULT_BRANDING = {
  siteName: 'TikDL',
  logoText: 'TikDL',
  primaryColor: '#FE2C55',
};

export default function SiteNavbar({ isHome = false, currentPage }: SiteNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const sidebarRef = useRef<HTMLDivElement>(null);

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

  // ESC key closes mobile sidebar
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mobileOpen]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const homeHref = (hash: string) => isHome ? hash : `/${hash}`;

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      {/* Fixed navbar bar — always on top */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold" style={{ backgroundColor: branding.primaryColor }}>♪</div>
              <span className="font-bold text-lg tracking-tighter">{branding.logoText}</span>
            </Link>
            {isHome && (
              <button
                onClick={() => window.location.reload()}
                className="ml-1 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150"
                title="Refresh page"
              >
                <RefreshCw size={14} className="text-gray-400 hover:text-white transition-colors" />
              </button>
            )}
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-400">
            <a href={homeHref('#features')} style={{ color: currentPage === 'features' ? branding.primaryColor : undefined }}>Features</a>
            <a href={homeHref('#faq')} style={{ color: currentPage === 'faq' ? branding.primaryColor : undefined }}>FAQ</a>
            <a href={homeHref('#history')} style={{ color: currentPage === 'history' ? branding.primaryColor : undefined }}>History</a>
            <Link href="/about" style={{ color: currentPage === 'about' ? branding.primaryColor : undefined }}>About</Link>
            <Link href="/contact" style={{ color: currentPage === 'contact' ? branding.primaryColor : undefined }}>Contact</Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150"
            aria-label="Toggle menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </nav>

      {/* Windows 11 style LEFT SIDEBAR — overlay, 280px, slides from left */}
      {/* Dark backdrop — covers entire page, click to close */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={closeMobile}
      />
      {/* Sidebar panel — fixed left, 280px, slides in from left */}
      <div
        ref={sidebarRef}
        className={`fixed top-0 left-0 bottom-0 z-50 md:hidden w-[280px] bg-[#1a1a1a]/98 backdrop-blur-xl border-r border-white/10 transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar header with close button */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold" style={{ backgroundColor: branding.primaryColor }}>♪</div>
            <span className="font-bold text-lg tracking-tighter">{branding.logoText}</span>
          </div>
          <button
            onClick={closeMobile}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150"
            aria-label="Close menu"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Sidebar links */}
        <div className="px-3 py-4 flex flex-col gap-1">
          <a
            href={homeHref('#features')}
            onClick={closeMobile}
            className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/8 transition-colors duration-150 text-gray-300 hover:text-white"
            style={currentPage === 'features' ? { color: branding.primaryColor } : undefined}
          >
            Features
          </a>
          <a
            href={homeHref('#faq')}
            onClick={closeMobile}
            className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/8 transition-colors duration-150 text-gray-300 hover:text-white"
            style={currentPage === 'faq' ? { color: branding.primaryColor } : undefined}
          >
            FAQ
          </a>
          <a
            href={homeHref('#history')}
            onClick={closeMobile}
            className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/8 transition-colors duration-150 text-gray-300 hover:text-white"
            style={currentPage === 'history' ? { color: branding.primaryColor } : undefined}
          >
            History
          </a>
          <Link
            href="/about"
            onClick={closeMobile}
            className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/8 transition-colors duration-150 text-gray-300 hover:text-white"
            style={currentPage === 'about' ? { color: branding.primaryColor } : undefined}
          >
            About
          </Link>
          <Link
            href="/contact"
            onClick={closeMobile}
            className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/8 transition-colors duration-150 text-gray-300 hover:text-white"
            style={currentPage === 'contact' ? { color: branding.primaryColor } : undefined}
          >
            Contact
          </Link>

          {/* Divider */}
          <div className="my-2 border-t border-white/8" />

          <Link
            href="/privacy"
            onClick={closeMobile}
            className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/8 transition-colors duration-150 text-gray-400 hover:text-white"
            style={currentPage === 'privacy' ? { color: branding.primaryColor } : undefined}
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            onClick={closeMobile}
            className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/8 transition-colors duration-150 text-gray-400 hover:text-white"
            style={currentPage === 'terms' ? { color: branding.primaryColor } : undefined}
          >
            Terms
          </Link>
          <Link
            href="/dmca"
            onClick={closeMobile}
            className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/8 transition-colors duration-150 text-gray-400 hover:text-white"
            style={currentPage === 'dmca' ? { color: branding.primaryColor } : undefined}
          >
            DMCA
          </Link>
        </div>
      </div>
    </>
  );
}
