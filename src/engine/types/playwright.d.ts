/**
 * Type stub for playwright module
 * 
 * The NovaDL engine's browser fallback uses Playwright for headless
 * browser extraction. TikDL doesn't need this feature in production.
 * This stub allows the TypeScript compiler to pass.
 */
declare module 'playwright' {
  export interface Browser {
    newContext(options?: unknown): Promise<BrowserContext>;
    close(): Promise<void>;
  }
  export interface BrowserContext {
    newPage(): Promise<Page>;
    close(): Promise<void>;
    addCookies(cookies: unknown[]): Promise<void>;
    cookies(urls?: string[]): Promise<unknown[]>;
  }
  export interface Page {
    goto(url: string, options?: unknown): Promise<unknown>;
    content(): Promise<string>;
    title(): Promise<string>;
    close(): Promise<void>;
    waitForSelector(selector: string, options?: unknown): Promise<unknown>;
  }
  export const chromium: {
    launch(options?: unknown): Promise<Browser>;
  };
}
