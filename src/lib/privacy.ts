/**
 * Privacy Utilities — Production Security & Infrastructure
 *
 * Utility functions for protecting user privacy in logs and analytics.
 * IP addresses are NEVER stored in raw form — they are hashed using
 * SHA-256 with a server-side salt, making them irreversible.
 *
 * Why hash IPs instead of storing raw IPs:
 * - GDPR/privacy compliance — IP addresses are personal data
 * - Security — raw IPs in logs could be exploited if leaked
 * - Rate limiting still works — same IP always produces the same hash
 * - Analytics still work — unique visitors can be counted by unique hashes
 * - Irreversible — SHA-256 with salt cannot be reversed to find the original IP
 *
 * The salt is derived from the ADMIN_PASSWORD env var (server-side only).
 * This ensures the hash output changes if the server is redeployed with
 * a different password, preventing cross-instance IP correlation.
 */

import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

// ============================================================================
// CLIENT IP EXTRACTION (SSRF-RESISTANT)
// ============================================================================

/**
 * Extract the real client IP from request headers, resistant to spoofing.
 *
 * Security: Uses the LAST IP in the X-Forwarded-For chain, which is set
 * by our trusted reverse proxy (Caddy). The first IP in the chain can be
 * spoofed by the client — an attacker could prepend arbitrary IPs to
 * bypass rate limiting. By taking the last IP (set by our proxy), we
 * ensure we always get the real client address.
 *
 * @param request Next.js request object
 * @returns The real client IP address
 */
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    // Take the LAST IP in the chain — set by our trusted reverse proxy
    // The first IP(s) can be client-injected and are untrustworthy
    const ips = xff.split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[ips.length - 1]) {
      return ips[ips.length - 1];
    }
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

// ============================================================================
// IP HASHING
// ============================================================================

/**
 * Get the hashing salt — derived from server-side secret.
 * Never exposed to browser JavaScript.
 */
function getHashSalt(): string {
  const adminPassword = process.env.ADMIN_PASSWORD || 'dev-fallback-salt';
  // Use a derivation that's different from the password itself
  return `tikdl-ip-hash-salt:${adminPassword}`;
}

/**
 * Hash an IP address using SHA-256 with a server-side salt.
 *
 * Properties:
 * - Same IP always produces the same hash (for rate limiting & analytics)
 * - Hash cannot be reversed to find the original IP (SHA-256 is one-way)
 * - Salt prevents pre-computed rainbow table attacks
 * - Different servers with different ADMIN_PASSWORD produce different hashes
 *   (prevents cross-instance IP correlation)
 *
 * @param ip Raw IP address (e.g. "192.168.1.1" or "10.0.0.1")
 * @returns SHA-256 hash string (64 hex characters)
 */
export function hashIp(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';

  const salt = getHashSalt();
  const hash = createHash('sha256')
    .update(`${salt}:${ip}`)
    .digest('hex');

  // Return first 16 chars for concise display (still unique enough for analytics)
  // Full hash is 64 chars, but 16 chars (64 bits) is sufficient for uniqueness
  return hash.slice(0, 16);
}

/**
 * Hash an IP address for rate limiting.
 * Uses the FULL hash (64 chars) for maximum uniqueness guarantee.
 * Rate limiting needs exact matching, so we use the full hash.
 *
 * @param ip Raw IP address
 * @returns Full SHA-256 hash string (64 hex characters)
 */
export function hashIpForRateLimit(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';

  const salt = getHashSalt();
  return createHash('sha256')
    .update(`${salt}:${ip}`)
    .digest('hex');
}
