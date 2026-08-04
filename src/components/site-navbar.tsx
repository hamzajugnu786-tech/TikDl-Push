'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RefreshCw, Menu, X } from 'lucide-react';

interface SiteNavbarProps {
  /** If true, show the refresh button and use hash links for home anchors */
  isHome?: boolean;
}

export default function SiteNavbar({ isHome = false }: SiteNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const homeHref = (hash: string) => isHome ? hash : `/${hash}`;

  return (
    <nav className="sticky top-0 z-50 glass border-b border-white/10 bg-black/80">
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

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-black/95 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3 text-sm font-medium text-gray-400">
            <a href={homeHref('#features')} onClick={() => setMobileOpen(false)} className="hover:text-[#FE2C55] transition-colors duration-150 py-1">Features</a>
            <a href={homeHref('#faq')} onClick={() => setMobileOpen(false)} className="hover:text-[#FE2C55] transition-colors duration-150 py-1">FAQ</a>
            <a href={homeHref('#history')} onClick={() => setMobileOpen(false)} className="hover:text-[#FE2C55] transition-colors duration-150 py-1">History</a>
            <Link href="/about" onClick={() => setMobileOpen(false)} className="hover:text-[#FE2C55] transition-colors duration-150 py-1">About</Link>
            <Link href="/contact" onClick={() => setMobileOpen(false)} className="hover:text-[#FE2C55] transition-colors duration-150 py-1">Contact</Link>
            <Link href="/privacy" onClick={() => setMobileOpen(false)} className="hover:text-[#FE2C55] transition-colors duration-150 py-1">Privacy</Link>
            <Link href="/terms" onClick={() => setMobileOpen(false)} className="hover:text-[#FE2C55] transition-colors duration-150 py-1">Terms</Link>
            <Link href="/dmca" onClick={() => setMobileOpen(false)} className="hover:text-[#FE2C55] transition-colors duration-150 py-1">DMCA</Link>
          </div>
        </div>
      )}
    </nav>
  );
}
