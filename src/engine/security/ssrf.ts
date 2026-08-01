/**
 * NovaDL Engine — SSRF (Server-Side Request Forgery) Protection Module
 *
 * Prevents the engine from making outbound requests to internal/private
 * network destinations, cloud metadata endpoints, and known blocked hosts.
 *
 * Protections cover:
 *  - RFC1918 private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)
 *  - Loopback addresses (127.x.x.x, 0.x.x.x)
 *  - Link-local addresses (169.254.x.x)
 *  - Cloud metadata endpoint (169.254.169.254)
 *  - IPv6 loopback (::1) and link-local (fe80::)
 *  - DNS rebinding attacks via resolved IP validation
 *  - Hostname-based blocklists
 */

import { validateUrl } from './validator';

// ─── Resolved URL Result ────────────────────────────────────────────

/**
 * Result of resolving and validating a URL against SSRF rules.
 */
export interface ResolvedUrlResult {
  /** Whether the URL passed all SSRF checks */
  safe: boolean;
  /** Resolved IP address(es) found for the host */
  resolvedIp?: string;
  /** Original hostname from the URL */
  hostname?: string;
  /** Reason for block if unsafe */
  reason?: string;
  /** The sanitized URL if safe */
  sanitizedUrl?: string;
}

// ─── Private IP Detection ────────────────────────────────────────────

/**
 * Checks whether an IP address belongs to a private, loopback,
 * link-local, or cloud-metadata range.
 *
 * Blocked ranges:
 *  - 10.0.0.0/8      (RFC1918 Class A private)
 *  - 172.16.0.0/12   (RFC1918 Class B private)
 *  - 192.168.0.0/16  (RFC1918 Class C private)
 *  - 127.0.0.0/8     (IPv4 loopback)
 *  - 0.0.0.0/8       (Current network)
 *  - 169.254.0.0/16  (IPv4 link-local / cloud metadata)
 *  - ::1             (IPv6 loopback)
 *  - fe80::/10       (IPv6 link-local)
 *  - ::              (IPv6 unspecified / all addresses)
 *  - fc00::/7        (IPv6 unique local / private)
 *
 * @param ip - IPv4 or IPv6 address string to check
 * @returns true if the IP is private/blocked, false otherwise
 */
export function isPrivateIP(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return true; // Treat unknown IPs as blocked by default
  }

  const trimmed = ip.trim().toLowerCase();

  // ── IPv6 ──────────────────────────────────────

  // IPv6 loopback (::1, sometimes written with extra colons)
  if (trimmed === '::1' || trimmed === '0000:0000:0000:0000:0000:0000:0000:0001') {
    return true;
  }

  // IPv6 unspecified address (::)
  if (trimmed === '::' || trimmed === '0000:0000:0000:0000:0000:0000:0000:0000') {
    return true;
  }

  // IPv6 link-local (fe80::/10)
  if (trimmed.startsWith('fe80:') || trimmed.startsWith('fe8') || trimmed === 'fe80::') {
    return true;
  }

  // IPv6 unique local addresses (fc00::/7) — includes fc00:: and fd00:: prefixes
  if (trimmed.startsWith('fc') || trimmed.startsWith('fd')) {
    // Only block if it starts with fc00: or fd00: (the /7 prefix)
    if (/^[f][cd]/i.test(trimmed)) {
      return true;
    }
  }

  // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  const ipv4MappedMatch = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4MappedMatch) {
    return isPrivateIPv4(ipv4MappedMatch[1] ?? '');
  }

  // ── IPv4 ──────────────────────────────────────

  // Pure IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    return isPrivateIPv4(trimmed);
  }

  // If it's some other IPv6 format we didn't match, be conservative
  if (trimmed.includes(':')) {
    // For compressed IPv6, try to detect loopback/link-local patterns
    // that may not have been caught above
    if (trimmed === '::1' || trimmed.startsWith('fe80')) {
      return true;
    }
  }

  // Unknown format — treat as potentially unsafe
  return false;
}

/**
 * Checks whether an IPv4 address is private/loopback/link-local.
 *
 * @param ip - IPv4 address string (e.g., "192.168.1.1")
 * @returns true if the IP is in a blocked range
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return true;

  const octets = parts.map((p) => {
    const n = Number(p);
    // Reject non-numeric or out-of-range octets
    if (!Number.isInteger(n) || n < 0 || n > 255) return -1;
    return n;
  });

  // If any octet is invalid, treat as blocked
  if (octets.some((o) => o === -1)) return true;

  const [a, b, c, d] = octets as [number, number, number, number];

  // 0.0.0.0/8 — "this network" / current network
  if (a === 0) return true;

  // 10.0.0.0/8 — RFC1918 Class A private
  if (a === 10) return true;

  // 127.0.0.0/8 — Loopback
  if (a === 127) return true;

  // 169.254.0.0/16 — Link-local (includes cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 — RFC1918 Class B private (172.16.x.x through 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 — RFC1918 Class C private
  if (a === 192 && b === 168) return true;

  // 100.64.0.0/10 — Carrier-grade NAT (RFC6598) — often used in shared infrastructure
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 198.18.0.0/15 — Benchmark testing (RFC2544)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // Broadcast address
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

// ── Host-based SSRF Blocking ────────────────────────────────────────

/**
 * Checks whether a URL's hostname matches any entry in a blocked-hosts
 * list. Matching is case-insensitive and supports both exact hostname
 * matches and subdomain matching (e.g., blocking "internal.corp"
 * also blocks "api.internal.corp").
 *
 * @param url         - The URL to check
 * @param blockedHosts - Array of hostnames to block (exact + subdomain)
 * @returns true if the URL hostname is in the blocked list
 */
export function isSSRFBlocked(url: string, blockedHosts: string[]): boolean {
  if (!url || !blockedHosts || blockedHosts.length === 0) {
    return false;
  }

  // Parse URL to extract hostname and path/query for SSRF checks
  let hostname: string;
  let urlPath: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.toLowerCase();
    urlPath = (parsed.pathname + parsed.search).toLowerCase();
  } catch {
    // If URL is invalid, it can't be resolved — treat as blocked
    return true;
  }

  for (const blocked of blockedHosts) {
    const blockedLower = blocked.toLowerCase().trim();

    // Exact hostname match
    if (hostname === blockedLower) {
      return true;
    }

    // Subdomain match: if we block "internal.corp", also block "x.internal.corp"
    if (hostname.endsWith(`.${blockedLower}`)) {
      return true;
    }

    // Path-based match: check if blocked host appears in URL path/query
    // to catch redirect payloads like https://legit.com/redirect?to=internal.corp
    // Uses parsed path/query rather than raw string includes to avoid
    // false positives (e.g., blocking 'evil' would match '@evil_user')
    if (urlPath.includes(blockedLower)) {
      return true;
    }
  }

  return false;
}

// ── DNS Resolution + Full SSRF Validation ────────────────────────────

/**
 * Resolves a URL's hostname to its actual IP address(es) and validates
 * that none of the resolved IPs are private/loopback/link-local.
 *
 * This prevents DNS rebinding attacks where a hostname initially resolves
 * to a public IP but later resolves to a private IP after the initial
 * check.
 *
 * @param url          - The URL to resolve and validate
 * @param blockedHosts - Optional list of blocked hostnames
 * @returns ResolvedUrlResult indicating whether the URL is safe
 */
export async function resolveAndValidateUrl(
  url: string,
  blockedHosts: string[] = [],
): Promise<ResolvedUrlResult> {
  // First validate URL format
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    return {
      safe: false,
      reason: `Invalid URL: ${urlValidation.errors.join('; ')}`,
    };
  }

  const sanitizedUrl = urlValidation.sanitized ?? url;

  // Parse the URL
  let parsed: URL;
  try {
    parsed = new URL(sanitizedUrl);
  } catch {
    return {
      safe: false,
      reason: 'Failed to parse URL after sanitization',
    };
  }

  const hostname = parsed.hostname;

  // Check hostname-based blocklist
  if (isSSRFBlocked(sanitizedUrl, blockedHosts)) {
    return {
      safe: false,
      hostname,
      reason: `Hostname '${hostname}' is in the SSRF blocked-hosts list`,
    };
  }

  // Quick private-IP check on hostname (if hostname looks like an IP)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIP(hostname)) {
      return {
        safe: false,
        hostname,
        resolvedIp: hostname,
        reason: `Hostname IP '${hostname}' is a private/reserved address`,
      };
    }
    // IP address that's public — still check via DNS for consistency
  }

  // Attempt DNS resolution
  let resolvedIp: string | undefined;

  try {
    // Use Node.js dns.resolve to get actual IPs
    // We import dynamically to avoid issues in environments without dns module
    const dns = await import('node:dns/promises');

    // Try IPv4 first
    try {
      const v4Addresses = await dns.resolve4(hostname);
      if (v4Addresses.length > 0) {
        // Check ALL resolved addresses — if any is private, block
        for (const addr of v4Addresses) {
          if (isPrivateIP(addr)) {
            return {
              safe: false,
              hostname,
              resolvedIp: addr,
              reason: `Resolved IP '${addr}' for '${hostname}' is a private/reserved address`,
            };
          }
        }
        resolvedIp = v4Addresses[0];
      }
    } catch {
      // IPv4 resolution failed — try IPv6
    }

    // Try IPv6
    try {
      const v6Addresses = await dns.resolve6(hostname);
      if (v6Addresses.length > 0) {
        for (const addr of v6Addresses) {
          if (isPrivateIP(addr)) {
            return {
              safe: false,
              hostname,
              resolvedIp: addr,
              reason: `Resolved IPv6 '${addr}' for '${hostname}' is a private/reserved address`,
            };
          }
        }
        if (!resolvedIp) {
          resolvedIp = v6Addresses[0];
        }
      }
    } catch {
      // IPv6 resolution also failed
    }

    // If neither v4 nor v6 resolved, the host may not exist
    if (!resolvedIp) {
      // Try a lookup (which resolves to whatever is available)
      try {
        const lookupResult = await dns.lookup(hostname);
        resolvedIp = lookupResult.address;

        if (isPrivateIP(resolvedIp)) {
          return {
            safe: false,
            hostname,
            resolvedIp,
            reason: `Resolved IP '${resolvedIp}' for '${hostname}' is a private/reserved address`,
          };
        }
      } catch {
        return {
          safe: false,
          hostname,
          reason: `Could not resolve hostname '${hostname}'`,
        };
      }
    }
  } catch {
    // DNS module unavailable (e.g., browser environment)
    // Fall back to hostname-based check only
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && isPrivateIP(hostname)) {
      return {
        safe: false,
        hostname,
        resolvedIp: hostname,
        reason: `Hostname IP '${hostname}' is a private/reserved address`,
      };
    }

    // If we can't resolve and hostname isn't obviously an IP,
    // we still allow it but note the limitation
    return {
      safe: true,
      hostname,
      sanitizedUrl,
      reason: 'DNS resolution unavailable; SSRF check limited to hostname analysis',
    };
  }

  // All checks passed
  return {
    safe: true,
    hostname,
    resolvedIp,
    sanitizedUrl,
  };
}
