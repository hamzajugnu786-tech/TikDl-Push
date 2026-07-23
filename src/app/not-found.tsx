import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center text-white px-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-[#FE2C55] rounded-xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">♪</div>
        <h1 className="text-6xl sm:text-8xl font-bold mb-4">404</h1>
        <p className="text-xl sm:text-2xl mb-8 text-gray-400">Page not found</p>
        <Link
          href="/"
          className="inline-block px-8 py-4 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-2xl font-semibold transition-colors"
        >
          Back to TikDL
        </Link>
      </div>
    </div>
  );
}
