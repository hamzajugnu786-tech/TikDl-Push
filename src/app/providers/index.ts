import { DownloadProvider } from './types';
import { TikHubProvider } from './tikhub';
import { RapidAPIProvider } from './rapidapi';

// Provider factory — selects active provider based on environment config
// Priority: tikhub > rapidapi > mock (fallback only for development)
export function getProvider(): DownloadProvider {
  const providerName = process.env.PROVIDER_NAME?.toLowerCase() || 'tikhub';

  console.log(`[Provider] Using provider: ${providerName}`);

  switch (providerName) {
    case 'tikhub':
      return new TikHubProvider();
    case 'rapidapi':
      return new RapidAPIProvider();
    default:
      console.warn(`[Provider] Unknown provider "${providerName}", falling back to tikhub`);
      return new TikHubProvider();
  }
}

// Multi-provider fallback chain: try primary, then backup
export async function fetchWithFallback(url: string): Promise<{ data: any; provider: string }> {
  const primary = getProvider();
  const fallback = primary.name === 'tikhub' ? new RapidAPIProvider() : new TikHubProvider();

  try {
    const data = await primary.fetchVideo(url);
    return { data, provider: primary.name };
  } catch (primaryError) {
    console.warn(`[Provider] ${primary.name} failed, trying fallback ${fallback.name}`);
    try {
      const data = await fallback.fetchVideo(url);
      return { data, provider: fallback.name };
    } catch (fallbackError) {
      console.error(`[Provider] Both providers failed`);
      throw primaryError;
    }
  }
}
