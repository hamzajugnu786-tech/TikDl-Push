'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

// Default branding — used before /api/config/settings loads or if DB is empty
const DEFAULT_BRANDING = {
  siteName: 'TikDL',
  logoText: 'TikDL',
  primaryColor: '#FE2C55',
};

export default function SiteFooter() {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  // Fetch DB-backed site branding on mount
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

  return (
    <footer className="py-6 px-4 sm:px-6 bg-[#0a0a0a] border-t border-white/10 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: branding.primaryColor }}>♪</div>
            <span className="font-bold text-base tracking-tighter">{branding.logoText}</span>
          </Link>
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-gray-500">
          <Link href="/#features" className="transition-colors duration-150" style={{ color: undefined }}>How To Use</Link>
          <Link href="/#faq" className="transition-colors duration-150">FAQ</Link>
          <Link href="/about" className="transition-colors duration-150">About</Link>
          <Link href="/contact" className="transition-colors duration-150">Contact</Link>
          <Link href="/privacy" className="transition-colors duration-150">Privacy</Link>
          <Link href="/terms" className="transition-colors duration-150">Terms</Link>
          <Link href="/dmca" className="transition-colors duration-150">DMCA</Link>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-600">
            {branding.siteName} is not affiliated with TikTok. For personal use only.
          </p>
        </div>
      </div>
      <div className="max-w-5xl mx-auto mt-4 pt-3 border-t border-white/5 text-center">
        <p className="text-xs text-gray-500">
          Powered by{' '}
          <a
            href="https://silbren.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#9CA3AF] hover:text-white transition-colors duration-150 font-medium"
          >
            Silbren.com
          </a>
        </p>
      </div>
    </footer>
  );
}
