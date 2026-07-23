import { DownloadProvider } from './types';
import { MockProvider } from './mock';
import { TikHubProvider } from './tikhub';
import { RapidAPIProvider } from './rapidapi';

export function getProvider(): DownloadProvider {
  const providerName = process.env.PROVIDER_NAME?.toLowerCase() || 'mock';
  
  console.log(`[Provider] Using provider: ${providerName}`);

  switch (providerName) {
    case 'mock':
      return new MockProvider();
    case 'tikhub':
      return new TikHubProvider();
    case 'rapidapi':
      return new RapidAPIProvider();
    default:
      console.warn(`[Provider] Unknown provider ${providerName}, falling back to mock`);
      return new MockProvider();
  }
}

// Example skeleton for future providers
/*
export class TikHubProvider implements DownloadProvider {
  name = 'tikhub';
  async fetchVideo(url: string): Promise<VideoMetadata> {
    const apiKey = process.env.TIKTOK_API_KEY;
    if (!apiKey) throw new Error('TIKTOK_API_KEY not configured');
    // Implement fetch...
  }
}
*/
