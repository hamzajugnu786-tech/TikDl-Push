/**
 * HTML Sanitization Utility — RC1 Production Hardened
 *
 * Uses DOMPurify to sanitize advertisement HTML before rendering on the client.
 * Prevents XSS attacks from malicious ad code stored in the database.
 *
 * ⚠️  CRITICAL: DOMPurify requires a browser window object and does NOT work
 *     in Node.js server-side code. Calling DOMPurify.sanitize() in an API route
 *     will crash with "DOMPurify.sanitize is not a function".
 *
 * Architecture:
 * - Client-side (browser): sanitizeAdHtml() uses DOMPurify — full sanitization
 * - Server-side (API route): sanitizeAdHtmlServer() uses regex-based stripping
 *   as a defense-in-depth layer. It removes <script>, event handlers, and
 *   dangerous tags, but is NOT as thorough as DOMPurify.
 * - Both layers work together: server strips worst offenders on write,
 *   client does thorough sanitization on render.
 *
 * Why DOMPurify (client-side only):
 * - Industry standard HTML sanitizer (15M+ weekly npm downloads)
 * - Used by Facebook, Google, Microsoft for XSS prevention
 * - Specifically designed for dangerouslySetInnerHTML rendering
 * - Zero dependencies, lightweight (~15KB)
 * - Regular security updates and CVE response
 */

// ============================================================================
// DOMPURIFY — CLIENT-SIDE ONLY
// ============================================================================

// DOMPurify is only imported when actually running in a browser.
// In Node.js (API routes), the import succeeds but .sanitize() is undefined.
// We detect this at runtime and fall back gracefully.

let DOMPurify: any = null;
let dompurifyAvailable = false;

try {
  // DOMPurify is browser-only, must use require() for conditional runtime loading
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DOMPurify = require('dompurify');
  // Test if .sanitize() is available (it's undefined in Node.js)
  if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
    dompurifyAvailable = true;
  }
} catch {
  // DOMPurify not available at all (shouldn't happen with npm install)
  dompurifyAvailable = false;
}

// ============================================================================
// SANITIZATION CONFIGURATION
// ============================================================================

/**
 * Allowed HTML tags for advertisement content.
 * ⚠️  'iframe' removed from general sanitizer for security.
 *     If iframe embeds are needed, they should go through a dedicated
 *     iframe sanitization pipeline (not mixed with general ad content).
 */
const ALLOWED_TAGS = [
  'div', 'span', 'p', 'br', 'hr',
  'a', 'img', 'video', 'source', 'audio',
  'button', 'input',
  'table', 'tr', 'td', 'th', 'thead', 'tbody',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
  'blockquote', 'code', 'pre',
];

/**
 * Allowed HTML attributes for advertisement content.
 * Event handlers (onclick, onerror, onload, etc.) are NEVER allowed.
 */
const ALLOWED_ATTR = [
  'class', 'id', 'style',
  'href', 'src', 'alt', 'title',
  'width', 'height',
  'target', 'rel',
  'data-*',
  'type', 'name', 'value', 'placeholder',
  'controls', 'autoplay', 'loop', 'muted', 'playsinline',
  'loading', 'decoding',
];

/**
 * DOMPurify configuration object.
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: true,
  FORBID_ATTR: [
    'onmouseover', 'onmouseout', 'onmousedown', 'onmouseup',
    'onclick', 'ondblclick', 'onfocus', 'onblur', 'onkeydown', 'onkeyup',
    'onkeypress', 'oncontextmenu', 'onerror', 'onload', 'onresize',
    'onscroll', 'onsubmit', 'onchange', 'oninput', 'onselect',
    'onbeforeunload', 'onafterprint', 'onbeforeprint',
    'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover',
    'ondragstart', 'ondrop', 'oncopy', 'oncut', 'onpaste',
  ],
  FORBID_TAGS: [
    'script', 'object', 'embed', 'applet',
    'meta', 'link', 'base', 'noscript',
    'iframe',  // Removed from general sanitizer — security hardening
  ],
  ADD_ATTR: ['target', 'rel'],
  RETURN_TRUSTED_TYPE: false,
};

// ============================================================================
// CLIENT-SIDE SANITIZATION (DOMPurify)
// ============================================================================

/**
 * Sanitize HTML content for safe rendering via dangerouslySetInnerHTML.
 *
 * This is the ONLY function that should be used BEFORE passing
 * ad HTML to dangerouslySetInnerHTML on the client. Never render raw ad HTML.
 *
 * ⚠️  This function ONLY works in browser context (DOMPurify requires window).
 *     In Node.js server-side code, use sanitizeAdHtmlServer() instead.
 *
 * Usage (client-side only):
 *   const safeHtml = sanitizeAdHtml(ad.adCode);
 *   <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
 *
 * @param html Raw HTML from the database (potentially unsafe)
 * @returns Sanitized HTML string safe for browser rendering
 */
export function sanitizeAdHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  // If DOMPurify is available (browser context), use it for thorough sanitization
  if (dompurifyAvailable) {
    const purified = DOMPurify.sanitize(html, PURIFY_CONFIG) as string;

    // Enforce target="_blank" rel="noopener noreferrer" on all links
    // This prevents reverse tab-nabbing attacks
    const linkSafe = purified.replace(
      /<a\s+(?![^>]*target=["']_blank["'])/gi,
      '<a target="_blank" rel="noopener noreferrer" '
    );

    // Ensure all existing links with target="_blank" also have noopener noreferrer
    const finalSafe = linkSafe.replace(
      /<a\s+([^>]*?)target=["']_blank["']([^>]*?)>/gi,
      (match: string, before: string, after: string) => {
        if (before.includes('rel=') || after.includes('rel=')) {
          return match.replace(
            /rel=["']([^"']*)["']/gi,
            (_, rels: string) => `rel="${rels} noopener noreferrer"`
          );
        }
        return `<a ${before}target="_blank" rel="noopener noreferrer" ${after}>`;
      }
    );

    return finalSafe;
  }

  // Fallback: server-side (Node.js) — use regex-based stripping
  // This is a defense-in-depth layer, not as thorough as DOMPurify
  return sanitizeAdHtmlServer(html);
}

// ============================================================================
// SERVER-SIDE SANITIZATION (Regex-based — defense-in-depth)
// ============================================================================

/**
 * Tags that are ALWAYS stripped from ad HTML on the server.
 * These are the most dangerous XSS vectors.
 */
const DANGEROUS_TAGS = [
  'script', 'object', 'embed', 'applet',
  'meta', 'link', 'base', 'noscript',
  'iframe',  // Removed for security — iframes should not be in general ad content
];

/**
 * Event handler attribute prefixes that are ALWAYS stripped.
 * Covers all on* event handlers (onclick, onerror, onload, etc.)
 */
const DANGEROUS_ATTR_PATTERN = /\s+on\w+\s*=\s*["'][^"']*["']/gi;

/**
 * javascript: and vbscript: URL patterns that are ALWAYS stripped.
 */
const DANGEROUS_URL_PATTERN = /(?:href|src|action|formaction|data|background)\s*=\s*["'](?:javascript|vbscript|data)\s*:[^"']*["']/gi;

/**
 * Server-safe HTML sanitization using regex-based stripping.
 *
 * This is a defense-in-depth layer for the API route that writes ad HTML
 * to the database. It removes the most dangerous XSS vectors:
 * - <script>, <object>, <iframe>, etc. tags
 * - All on* event handler attributes
 * - javascript: and vbscript: URLs
 *
 * ⚠️  This is NOT as thorough as DOMPurify. It's a first-pass filter.
 *     The client-side sanitizeAdHtml() (which uses DOMPurify) does
 *     the thorough sanitization when rendering.
 *
 * @param html Raw HTML from the admin (potentially unsafe)
 * @returns HTML with dangerous XSS vectors removed
 */
export function sanitizeAdHtmlServer(html: string): string {
  if (!html || typeof html !== 'string') return '';

  let result = html;

  // 1. Remove dangerous tags and their contents
  for (const tag of DANGEROUS_TAGS) {
    // For tags that can contain content (script, iframe, etc.), remove entire block first
    if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'applet' || tag === 'noscript') {
      // Remove <tag>...</tag> including all content between them
      result = result.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
    }
    // Remove any remaining opening/closing tags (self-closing or unclosed)
    result = result.replace(new RegExp(`<${tag}[\\s\\/]*?>`, 'gi'), '');
    result = result.replace(new RegExp(`<\\/${tag}>`, 'gi'), '');
  }

  // 2. Remove all on* event handler attributes
  result = result.replace(DANGEROUS_ATTR_PATTERN, '');

  // 3. Remove javascript:/vbscript:/data: URLs in href, src, etc.
  result = result.replace(DANGEROUS_URL_PATTERN, '');

  // 4. Enforce target="_blank" rel="noopener noreferrer" on links
  result = result.replace(
    /<a\s+(?![^>]*target=["']_blank["'])/gi,
    '<a target="_blank" rel="noopener noreferrer" '
  );

  return result;
}
