/**
 * NovaDL Engine — Abuse Detection Module
 *
 * Tracks patterns of suspicious behavior across requests and flags
 * abusive clients based on configurable thresholds. Patterns tracked:
 *
 *  1. Repeated failures from the same IP (extraction errors, timeouts)
 *  2. Rapid sequential requests (bursting beyond normal usage)
 *  3. Requests targeting the same URL pattern (scraping indicators)
 *
 * The detector uses sliding windows for all tracking and supports
 * per-IP and per-key analysis. Results are returned as
 * AbuseDetectionResult with an isAbusive flag and detailed breakdown.
 */

import type { SecurityConfig } from '../types/index';

// ─── Abuse Detection Result ──────────────────────────────────────────

/**
 * Detailed result of an abuse detection check.
 */
export interface AbuseDetectionResult {
  /** Whether the client is flagged as abusive */
  isAbusive: boolean;
  /** Overall severity level: 'low', 'medium', 'high', or 'critical' */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Individual signals that contributed to the flag */
  signals: AbuseSignal[];
  /** Recommended action for the caller */
  recommendedAction: 'allow' | 'throttle' | 'block' | 'quarantine';
  /** Summary reason string */
  reason: string;
}

/**
 * An individual abuse signal (one pattern that was detected).
 */
export interface AbuseSignal {
  /** Type of the detected pattern */
  type: 'repeated_failures' | 'rapid_requests' | 'repeated_url_pattern' | 'suspicious_platform' | 'anomalous_volume';
  /** How many times this pattern was observed */
  count: number;
  /** The threshold that was exceeded */
  threshold: number;
  /** Human-readable description */
  description: string;
  /** When this signal was first detected */
  firstSeen: Date;
  /** When this signal was most recently observed */
  lastSeen: Date;
}

// ─── Internal Tracking Entries ───────────────────────────────────────

interface FailureTracker {
  count: number;
  firstSeen: number;
  lastSeen: number;
  timestamps: number[];
}

interface RequestTracker {
  timestamps: number[];
  urls: Map<string, number>; // url pattern → count
}

// ─── Abuse Detector ──────────────────────────────────────────────────

/**
 * AbuseDetector tracks patterns of suspicious behavior and determines
 * whether a client should be flagged as abusive.
 *
 * Configurable via SecurityConfig.abuseDetection:
 *  - threshold: number of abuse signals needed before flagging
 *  - windowMs: sliding window duration for tracking
 *
 * Additional tuning parameters:
 *  - maxFailuresPerWindow: repeated failure threshold
 *  - maxRequestsPerMinute: rapid request threshold
 *  - maxSameUrlPattern: repeated URL pattern threshold
 */
export class AbuseDetector {
  private readonly failureThreshold: number;
  private readonly rapidRequestThreshold: number;
  private readonly sameUrlPatternThreshold: number;
  private readonly windowMs: number;
  private readonly signalThreshold: number;

  // Tracking stores
  private readonly failures: Map<string, FailureTracker> = new Map();
  private readonly requests: Map<string, RequestTracker> = new Map();

  // Minimum defaults
  private static readonly DEFAULT_FAILURE_THRESHOLD = 10;
  private static readonly DEFAULT_RAPID_REQUEST_THRESHOLD = 60;
  private static readonly DEFAULT_SAME_URL_THRESHOLD = 5;
  private static readonly DEFAULT_WINDOW_MS = 60_000;
  private static readonly DEFAULT_SIGNAL_THRESHOLD = 2;

  /**
   * Creates a new AbuseDetector.
   *
   * @param config - Security configuration with abuse detection settings
   * @param options - Optional overrides for detection thresholds
   */
  constructor(
    config?: SecurityConfig,
    options?: {
      maxFailuresPerWindow?: number;
      maxRequestsPerMinute?: number;
      maxSameUrlPattern?: number;
    },
  ) {
    this.failureThreshold = options?.maxFailuresPerWindow ?? AbuseDetector.DEFAULT_FAILURE_THRESHOLD;
    this.rapidRequestThreshold = options?.maxRequestsPerMinute ?? AbuseDetector.DEFAULT_RAPID_REQUEST_THRESHOLD;
    this.sameUrlPatternThreshold = options?.maxSameUrlPattern ?? AbuseDetector.DEFAULT_SAME_URL_THRESHOLD;
    this.windowMs = config?.abuseDetection?.windowMs ?? AbuseDetector.DEFAULT_WINDOW_MS;
    this.signalThreshold = config?.abuseDetection?.threshold ?? AbuseDetector.DEFAULT_SIGNAL_THRESHOLD;
  }

  // ── Failure Tracking ────────────────────────────────────────────

  /**
   * Records a failed extraction attempt for the given client key.
   *
   * @param key - Client identifier (IP, API key, etc.)
   */
  recordFailure(key: string): void {
    const now = Date.now();
    const tracker = this.failures.get(key);

    if (!tracker) {
      this.failures.set(key, {
        count: 1,
        firstSeen: now,
        lastSeen: now,
        timestamps: [now],
      });
      return;
    }

    // Prune timestamps outside the window
    tracker.timestamps = tracker.timestamps.filter((ts) => ts > now - this.windowMs);
    tracker.timestamps.push(now);
    tracker.count = tracker.timestamps.length;
    tracker.lastSeen = now;
  }

  // ── Request Tracking ────────────────────────────────────────────

  /**
   * Records a request (successful or not) for the given client key.
   * Also tracks the URL pattern to detect scraping behavior.
   *
   * @param key - Client identifier
   * @param url - The URL being requested (pattern extracted automatically)
   */
  recordRequest(key: string, url: string): void {
    const now = Date.now();
    const tracker = this.requests.get(key);

    // Extract URL pattern (hostname + path prefix, ignoring query params and specific IDs)
    const urlPattern = this.extractUrlPattern(url);

    if (!tracker) {
      const urls = new Map<string, number>();
      urls.set(urlPattern, 1);
      this.requests.set(key, {
        timestamps: [now],
        urls,
      });
      return;
    }

    // Prune timestamps outside the window
    tracker.timestamps = tracker.timestamps.filter((ts) => ts > now - this.windowMs);
    tracker.timestamps.push(now);

    // Track URL pattern frequency
    const currentCount = tracker.urls.get(urlPattern) ?? 0;
    tracker.urls.set(urlPattern, currentCount + 1);
  }

  // ── Detection ────────────────────────────────────────────────────

  /**
   * Evaluates whether the given client key exhibits abusive behavior
   * based on all tracked patterns.
   *
   * @param key - Client identifier to evaluate
   * @returns AbuseDetectionResult with isAbusive flag and detailed signals
   */
  detect(key: string): AbuseDetectionResult {
    const now = Date.now();
    const signals: AbuseSignal[] = [];

    // ── 1. Repeated failures ──────────────────────
    const failureTracker = this.failures.get(key);
    if (failureTracker) {
      // Prune timestamps
      failureTracker.timestamps = failureTracker.timestamps.filter((ts) => ts > now - this.windowMs);
      failureTracker.count = failureTracker.timestamps.length;

      if (failureTracker.count >= this.failureThreshold) {
        signals.push({
          type: 'repeated_failures',
          count: failureTracker.count,
          threshold: this.failureThreshold,
          description: `${failureTracker.count} failures within ${this.windowMs}ms window (threshold: ${this.failureThreshold})`,
          firstSeen: new Date(failureTracker.firstSeen),
          lastSeen: new Date(failureTracker.lastSeen),
        });
      }
    }

    // ── 2. Rapid sequential requests ──────────────
    const requestTracker = this.requests.get(key);
    if (requestTracker) {
      // Prune timestamps
      requestTracker.timestamps = requestTracker.timestamps.filter((ts) => ts > now - this.windowMs);

      if (requestTracker.timestamps.length >= this.rapidRequestThreshold) {
        signals.push({
          type: 'rapid_requests',
          count: requestTracker.timestamps.length,
          threshold: this.rapidRequestThreshold,
          description: `${requestTracker.timestamps.length} requests within ${this.windowMs}ms window (threshold: ${this.rapidRequestThreshold})`,
          firstSeen: new Date(requestTracker.timestamps[0] ?? now),
          lastSeen: new Date(requestTracker.timestamps[requestTracker.timestamps.length - 1] ?? now),
        });
      }

      // ── 3. Repeated URL patterns ──────────────
      for (const [pattern, count] of requestTracker.urls) {
        if (count >= this.sameUrlPatternThreshold) {
          signals.push({
            type: 'repeated_url_pattern',
            count,
            threshold: this.sameUrlPatternThreshold,
            description: `URL pattern '${pattern}' hit ${count} times (threshold: ${this.sameUrlPatternThreshold})`,
            firstSeen: new Date(now - this.windowMs),
            lastSeen: new Date(now),
          });
        }
      }
    }

    // ── Determine abuse status ────────────────────
    const isAbusive = signals.length >= this.signalThreshold;

    // Determine severity
    let severity: AbuseDetectionResult['severity'] = 'low';
    if (isAbusive) {
      if (signals.length >= this.signalThreshold + 3) {
        severity = 'critical';
      } else if (signals.length >= this.signalThreshold + 2) {
        severity = 'high';
      } else if (signals.length >= this.signalThreshold + 1) {
        severity = 'medium';
      } else {
        severity = 'low';
      }
    }

    // Determine recommended action
    let recommendedAction: AbuseDetectionResult['recommendedAction'] = 'allow';
    if (severity === 'critical') {
      recommendedAction = 'block';
    } else if (severity === 'high') {
      recommendedAction = 'quarantine';
    } else if (severity === 'medium' || isAbusive) {
      recommendedAction = 'throttle';
    }

    // Build reason string
    const reason = isAbusive
      ? `Client '${key}' flagged as abusive: ${signals.map((s) => s.type).join(', ')}`
      : `Client '${key}' shows no significant abuse patterns`;

    return {
      isAbusive,
      severity,
      signals,
      recommendedAction,
      reason,
    };
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  /**
   * Clears all tracking data for a specific client key.
   *
   * @param key - Client identifier to reset
   */
  reset(key: string): void {
    this.failures.delete(key);
    this.requests.delete(key);
  }

  /**
   * Clears all tracking data for all clients.
   */
  clearAll(): void {
    this.failures.clear();
    this.requests.clear();
  }

  /**
   * Performs garbage collection, removing entries whose windows
   * have fully expired. Should be called periodically.
   *
   * @returns Number of expired entries removed
   */
  gc(): number {
    const now = Date.now();
    let removed = 0;

    // Clean up failure trackers
    for (const [key, tracker] of this.failures) {
      tracker.timestamps = tracker.timestamps.filter((ts) => ts > now - this.windowMs);
      tracker.count = tracker.timestamps.length;
      if (tracker.count === 0) {
        this.failures.delete(key);
        removed++;
      }
    }

    // Clean up request trackers
    for (const [key, tracker] of this.requests) {
      tracker.timestamps = tracker.timestamps.filter((ts) => ts > now - this.windowMs);
      if (tracker.timestamps.length === 0) {
        this.requests.delete(key);
        removed++;
      } else {
        // Also prune URL patterns with zero recent hits
        for (const [pattern, count] of tracker.urls) {
          // If count exceeds what's possible in the current window, trim it
          if (count > tracker.timestamps.length) {
            tracker.urls.set(pattern, tracker.timestamps.length);
          }
        }
      }
    }

    return removed;
  }

  // ── URL Pattern Extraction ─────────────────────────────────────────

  /**
   * Extracts a generalized URL pattern from a specific URL.
   * Removes query parameters, fragments, and normalizes path segments
   * that look like IDs (numeric or long alphanumeric strings).
   *
   * Examples:
   *  - "https://tiktok.com/@user/video/123456" → "tiktok.com/@user/video/{id}"
   *  - "https://youtube.com/watch?v=abc123"     → "youtube.com/watch"
   *
   * @param url - The specific URL to generalize
   * @returns A pattern string suitable for grouping similar requests
   */
  private extractUrlPattern(url: string): string {
    try {
      const parsed = new URL(url);
      // Strip query params and hash — they're usually unique per request
      let path = parsed.pathname;

      // Replace numeric path segments with {id}
      path = path.replace(/\/\d+/g, '/{id}');

      // Replace long alphanumeric segments (likely IDs/slugs)
      path = path.replace(/\/[a-zA-Z0-9_-]{8,}/g, '/{slug}');

      return `${parsed.hostname}${path}`;
    } catch {
      // If URL can't be parsed, use the raw string as the pattern
      return url.slice(0, 100);
    }
  }

  // ── Accessors ───────────────────────────────────────────────────────

  /**
   * Returns the number of client keys currently tracked for failures.
   */
  get failureTrackingSize(): number {
    return this.failures.size;
  }

  /**
   * Returns the number of client keys currently tracked for requests.
   */
  get requestTrackingSize(): number {
    return this.requests.size;
  }
}
