import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/app/providers';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { url } = await request.json();
    
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Basic sanitization
    const sanitizedUrl = url.trim().slice(0, 500); // Prevent abuse

    console.log(`[API] Download request for: ${sanitizedUrl}`);

    const provider = getProvider();
    
    // Retry logic (up to 2 attempts)
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const metadata = await provider.fetchVideo(sanitizedUrl);
        
        const duration = Date.now() - startTime;
        console.log(`[API] Success in ${duration}ms using ${provider.name}`);
        
        return NextResponse.json({
          success: true,
          data: metadata,
          provider: provider.name,
          duration
        });
      } catch (err) {
        lastError = err as Error;
        console.error(`[API] Attempt ${attempt} failed:`, err);
        
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 800 * attempt)); // Backoff
        }
      }
    }

    throw lastError || new Error('All attempts failed');
  } catch (error) {
    console.error('[API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
