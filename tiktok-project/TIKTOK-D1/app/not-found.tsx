import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center text-white px-6">
      <div className="text-center">
        <h1 className="text-8xl font-bold mb-4">404</h1>
        <p className="text-2xl mb-8">Page not found</p>
        <Link href="/" className="inline-block px-8 py-4 bg-[#FE2C55] rounded-2xl font-medium">Back to Home</Link>
      </div>
    </div>
  );
}
