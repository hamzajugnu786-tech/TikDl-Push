import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="py-6 px-4 sm:px-6 bg-[#0a0a0a] border-t border-white/10 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#FE2C55] rounded-lg flex items-center justify-center text-sm font-bold">♪</div>
            <span className="font-bold text-base tracking-tighter">TikDL</span>
          </Link>
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-gray-500">
          <Link href="/#features" className="hover:text-[#FE2C55] transition-colors duration-150">Features</Link>
          <Link href="/#faq" className="hover:text-[#FE2C55] transition-colors duration-150">FAQ</Link>
          <Link href="/about" className="hover:text-[#FE2C55] transition-colors duration-150">About</Link>
          <Link href="/contact" className="hover:text-[#FE2C55] transition-colors duration-150">Contact</Link>
          <Link href="/privacy" className="hover:text-[#FE2C55] transition-colors duration-150">Privacy</Link>
          <Link href="/terms" className="hover:text-[#FE2C55] transition-colors duration-150">Terms</Link>
          <Link href="/dmca" className="hover:text-[#FE2C55] transition-colors duration-150">DMCA</Link>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-600">
            TikDL is not affiliated with TikTok. For personal use only.
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
