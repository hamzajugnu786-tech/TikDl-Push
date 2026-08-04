'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { RefreshCw, Menu, X } from 'lucide-react';

interface SiteNavbarProps {
  /** If true, show the refresh button and use hash links for home anchors */
  isHome?: boolean;
}

export default function SiteNavbar({ isHome = false }: SiteNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // ESC key closes mobile menu
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mobileOpen]);

  // Lock body scroll when mobile menu is open (overlay covers page)
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
              <div className="w-7 h-7 bg-[#FE2C55] rounded-lg flex items-center justify-center text-base font-bold">♪</div>
              <span className="font-bold text-lg tracking-tighter">TikDL</span>
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
            <a href={homeHref('#features')} className="hover:text-[#FE2C55] transition-colors duration-150">Features</a>
            <a href={homeHref('#faq')} className="hover:text-[#FE2C55] transition-colors duration-150">FAQ</a>
            <a href={homeHref('#history')} className="hover:text-[#FE2C55] transition-colors duration-150">History</a>
            <Link href="/about" className="hover:text-[#FE2C55] transition-colors duration-150">About</Link>
            <Link href="/contact" className="hover:text-[#FE2C55] transition-colors duration-150">Contact</Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile full-screen overlay — renders OUTSIDE the nav so it never pushes content */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={closeMobile}>
          {/* Dark backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          {/* Menu panel — slides down from top, covers page */}
          <div
            className="absolute top-0 left-0 right-0 bg-black/95 backdrop-blur-xl border-b border-white/10 pt-[52px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4 text-base font-medium text-gray-300">
              <a href={homeHref('#features')} onClick={closeMobile} className="hover:text-[#FE2C55] transition-colors duration-150 py-2">Features</a>
              <a href={homeHref('#faq')} onClick={closeMobile} className="hover:text-[#FE2C55] transition-colors duration-150 py-2">FAQ</a>
              <a href={homeHref('#history')} onClick={closeMobile} className="hover:text-[#FE2C55] transition-colors duration-150 py-2">History</a>
              <Link href="/about" onClick={closeMobile} className="hover:text-[#FE2C55] transition-colors duration-150 py-2">About</Link>
              <Link href="/contact" onClick={closeMobile} className="hover:text-[#FE2C55] transition-colors duration-150 py-2">Contact</Link>
              <Link href="/privacy" onClick={closeMobile} className="hover:text-[#FE2C55] transition-colors duration-150 py-2">Privacy</Link>
              <Link href="/terms" onClick={closeMobile} className="hover:text-[#FE2C55] transition-colors duration-150 py-2">Terms</Link>
              <Link href="/dmca" onClick={closeMobile} className="hover:text-[#FE2C55] transition-colors duration-150 py-2">DMCA</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
