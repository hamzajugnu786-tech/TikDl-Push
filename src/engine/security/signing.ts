/**
 * NovaDL Engine — Request Signing Module
 *
 * Provides HMAC-SHA256-based request signing and verification to ensure
 * request integrity and authenticity. Supports timestamp-based expiration
 * to prevent replay attacks.
 *
 * Flow:
 *  1. Client calls `signRequest(request, secret)` → receives a SignedRequest
 *  2. Client sends the SignedRequest to the server
 *  3. Server calls `verifySignature(signedRequest, secret)` → true/false
 *
 * Signature includes:
 *  - A canonical serialization of the request payload
 *  - A timestamp to prevent replay attacks
 *  - HMAC-SHA256 over the canonical string using the shared secret
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

// ─── Signed Request ──────────────────────────────────────────────────

/**
 * A request that has been signed with an HMAC-SHA256 signature.
 */
export interface SignedRequest {
  /** The original request payload */
  payload: Record<string, unknown>;
  /** Hex-encoded HMAC-SHA256 signature */
  signature: string;
  /** ISO-8601 timestamp when the signature was created */
  timestamp: string;
  /** The canonical string that was signed (for debugging) */
  canonical?: string;
}

/**
 * Configuration options for request signing.
 */
export interface SigningOptions {
  /** Maximum age of a signed request in milliseconds before it's considered expired */
  maxAgeMs?: number;
  /** Whether to include the canonical string in the SignedRequest (for debugging) */
  includeCanonical?: boolean;
  /** Custom clock skew tolerance in milliseconds (allows slight time differences) */
  clockSkewMs?: number;
}

// ─── Request Signer ──────────────────────────────────────────────────

/**
 * RequestSigner provides HMAC-SHA256-based request signing and verification.
 *
 * Features:
 *  - SHA-256 HMAC signatures for integrity verification
 *  - Timestamp-based expiration to prevent replay attacks
 *  - Canonical serialization ensures deterministic ordering
 *  - Timing-safe comparison prevents timing attacks on signature checks
 *  - Configurable expiration window and clock skew tolerance
 */
export class RequestSigner {
  private readonly defaultMaxAgeMs: number;
  private readonly defaultClockSkewMs: number;
  private readonly includeCanonical: boolean;

  /**
   * Default maximum request age: 5 minutes (300,000 ms)
   */
  private static readonly DEFAULT_MAX_AGE_MS = 300_000;

  /**
   * Default clock skew tolerance: 30 seconds (30,000 ms)
   */
  private static readonly DEFAULT_CLOCK_SKEW_MS = 30_000;

  /**
   * Creates a new RequestSigner.
   *
   * @param options - Optional configuration for signing behavior
   */
  constructor(options?: SigningOptions) {
    this.defaultMaxAgeMs = options?.maxAgeMs ?? RequestSigner.DEFAULT_MAX_AGE_MS;
    this.defaultClockSkewMs = options?.clockSkewMs ?? RequestSigner.DEFAULT_CLOCK_SKEW_MS;
    this.includeCanonical = options?.includeCanonical ?? false;
  }

  // ── Canonical Serialization ──────────────────────────────────────

  /**
   * Creates a canonical (deterministic) string representation of a
   * request payload for signing. The canonical form:
   *
   *  1. Sorts all keys alphabetically
   *  2. Serializes values as JSON strings (handles nested objects)
   *  3. Joins key=value pairs with '&'
   *  4. Appends the timestamp
   *
   * This ensures that the same payload always produces the same
   * canonical string, regardless of key ordering in the original object.
   *
   * @param payload   - The request payload to canonicalize
   * @param timestamp - The ISO timestamp to include in the canonical string
   * @returns The canonical string representation
   */
  createCanonicalString(payload: Record<string, unknown>, timestamp: string): string {
    // Sort keys alphabetically for deterministic ordering
    const sortedKeys = Object.keys(payload).sort();

    const parts: string[] = [];
    for (const key of sortedKeys) {
      const value = payload[key];
      // Serialize value: undefined → empty, objects → JSON, primitives → string
      let serialized: string;
      if (value === undefined || value === null) {
        serialized = '';
      } else if (typeof value === 'object') {
        serialized = JSON.stringify(this.sortObjectDeep(value as Record<string, unknown>));
      } else {
        serialized = String(value);
      }
      parts.push(`${key}=${serialized}`);
    }

    // Append timestamp to prevent signature reuse without timestamps
    return `${parts.join('&')}&timestamp=${timestamp}`;
  }

  /**
   * Recursively sorts an object's keys alphabetically, producing
   * a deterministic JSON serialization for nested payloads.
   *
   * @param obj - The object to sort
   * @returns A new object with keys sorted at every nesting level
   */
  private sortObjectDeep(obj: Record<string, unknown>): Record<string, unknown> {
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      const value = obj[key];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.sortObjectDeep(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  // ── Signing ────────────────────────────────────────────────────────

  /**
   * Signs a request payload using HMAC-SHA256 with the provided secret.
   *
   * The signature covers:
   *  - The canonical serialization of the payload
   *  - The current timestamp (ISO-8601 format)
   *
   * @param request - The request payload to sign
   * @param secret  - The shared secret key for HMAC computation
   * @returns SignedRequest with payload, signature, and timestamp
   */
  signRequest(request: Record<string, unknown>, secret: string): SignedRequest {
    if (!request || typeof request !== 'object') {
      throw new Error('Request must be a non-null object');
    }

    if (!secret || typeof secret !== 'string') {
      throw new Error('Secret must be a non-empty string');
    }

    const timestamp = new Date().toISOString();
    const canonical = this.createCanonicalString(request, timestamp);

    const hmac = createHmac('sha256', secret);
    hmac.update(canonical);
    const signature = hmac.digest('hex');

    return {
      payload: request,
      signature,
      timestamp,
      canonical: this.includeCanonical ? canonical : undefined,
    };
  }

  // ── Verification ───────────────────────────────────────────────────

  /**
   * Verifies the signature of a SignedRequest against the provided secret.
   *
   * Verification steps:
   *  1. Check that the timestamp is within the allowed age window
   *  2. Recompute the canonical string from the payload + stored timestamp
   *  3. Recompute the HMAC-SHA256 signature from the canonical string
   *  4. Compare the computed signature with the provided signature
   *     using timing-safe equality (prevents timing attacks)
   *
   * @param signedRequest - The signed request to verify
   * @param secret        - The shared secret key for HMAC computation
   * @param options       - Optional overrides for max age and clock skew
   * @returns true if the signature is valid and the request is not expired
   */
  verifySignature(
    signedRequest: SignedRequest,
    secret: string,
    options?: { maxAgeMs?: number; clockSkewMs?: number },
  ): boolean {
    if (!signedRequest || typeof signedRequest !== 'object') {
      return false;
    }

    if (!secret || typeof secret !== 'string') {
      return false;
    }

    if (!signedRequest.signature || !signedRequest.timestamp) {
      return false;
    }

    // ── Step 1: Check timestamp freshness ──
    const maxAgeMs = options?.maxAgeMs ?? this.defaultMaxAgeMs;
    const clockSkewMs = options?.clockSkewMs ?? this.defaultClockSkewMs;

    let requestTime: number;
    try {
      requestTime = new Date(signedRequest.timestamp).getTime();
    } catch {
      return false;
    }

    if (!Number.isFinite(requestTime)) {
      return false;
    }

    const now = Date.now();
    const age = Math.abs(now - requestTime);

    // Allow clock skew on both sides (client clock may be ahead or behind)
    if (age > maxAgeMs + clockSkewMs) {
      return false;
    }

    // ── Step 2: Recompute canonical string ──
    const canonical = this.createCanonicalString(signedRequest.payload, signedRequest.timestamp);

    // ── Step 3: Recompute signature ──
    const hmac = createHmac('sha256', secret);
    hmac.update(canonical);
    const computedSignature = hmac.digest('hex');

    // ── Step 4: Timing-safe comparison ──
    // Both signatures must be hex strings of the same length (SHA-256 = 64 hex chars)
    if (computedSignature.length !== signedRequest.signature.length) {
      return false;
    }

    try {
      const computedBuffer = Buffer.from(computedSignature, 'hex');
      const providedBuffer = Buffer.from(signedRequest.signature, 'hex');

      if (computedBuffer.length !== providedBuffer.length) {
        return false;
      }

      return timingSafeEqual(computedBuffer, providedBuffer);
    } catch {
      // If hex decoding fails, the signature format is invalid
      return false;
    }
  }

  // ── Utility ────────────────────────────────────────────────────────

  /**
   * Generates a new random secret suitable for use as a signing key.
   * Uses Node.js crypto to produce a cryptographically random hex string.
   *
   * @param bytes - Number of random bytes (default: 32 = 256-bit key)
   * @returns Hex-encoded random secret
   */
  static generateSecret(bytes: number = 32): string {
    return randomBytes(bytes).toString('hex');
  }
}
