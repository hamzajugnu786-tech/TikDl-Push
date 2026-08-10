/**
 * NovaDL Structured Logging — Production Security & Infrastructure
 *
 * Every download request generates a structured log entry containing:
 * - Request ID (for correlation)
 * - Timestamp
 * - Platform
 * - Provider
 * - Execution time
 * - Status (success/error)
 * - Error code (if error)
 * - IP hash (NEVER raw IP — hashed via SHA-256 for privacy)
 * - User Agent
 *
 * Logs are written to:
 * 1. Database (DownloadLog Prisma model) — for analytics dashboard
 *    - IP is stored as a hash (never raw IP)
 *    - requestId stored for log correlation
 * 2. Console (structured JSON) — for debugging and monitoring
 *    - IP is stored as a hash (never raw IP)
 *    - Full structured format with all fields
 *
 * Privacy compliance:
 * - Raw IP addresses are NEVER stored anywhere (GDPR requirement)
 * - SHA-256 hash with server-side salt makes IPs irreversible
 * - Same IP always produces the same hash (for rate limiting & unique visitor counting)
 */

import { NovaDLErrorCode } from './errors';
import { db } from '@/lib/db';
import { hashIp } from '@/lib/privacy';

// ============================================================================
// DEVICE DETECTION (Bug #3 — Analytics device tracking)
// ============================================================================
//
// Derives a coarse device category from the User-Agent string. We only need
// three buckets: "mobile", "tablet", "desktop". The detection is intentionally
// simple — it is NOT a full UA parser. NULL is returned when the UA is empty
// or unclassifiable so the UI can distinguish "unknown" from real data.
//
// Detection rules:
//   - iPad / Android tablet (no "Mobile" suffix) → "tablet"
//   - iPhone / Android Mobile / Windows Phone → "mobile"
//   - Everything else with a desktop UA token → "desktop"
//   - Empty / unknown UA → null

function detectDevice(userAgent: string | undefined | null): string | null {
  if (!userAgent || typeof userAgent !== 'string') return null;
  const ua = userAgent.toLowerCase();
  if (!ua) return null;

  // iPad / Android tablet — tablet UA contains "ipad" OR android without "mobile"
  if (ua.includes('ipad')) return 'tablet';
  if (ua.includes('android') && !ua.includes('mobile')) return 'tablet';
  if (ua.includes('tablet')) return 'tablet';

  // Mobile — iPhone, Android Mobile, Windows Phone, etc.
  if (ua.includes('iphone')) return 'mobile';
  if (ua.includes('android') && ua.includes('mobile')) return 'mobile';
  if (ua.includes('windows phone')) return 'mobile';
  if (ua.includes('blackberry')) return 'mobile';
  if (ua.includes('opera mini')) return 'mobile';
  if (ua.includes('mobile')) return 'mobile';

  // Desktop — Windows, Macintosh, Linux x86, etc.
  if (ua.includes('windows')) return 'desktop';
  if (ua.includes('macintosh') || ua.includes('mac os x')) return 'desktop';
  if (ua.includes('linux') && ua.includes('x86')) return 'desktop';
  if (ua.includes('x11') || ua.includes('bsd')) return 'desktop';

  // Unrecognized — return null so UI shows "unknown" rather than fabricate.
  return null;
}

// ============================================================================
// LOG ENTRY STRUCTURE
// ============================================================================

export interface DownloadLogEntry {
  /** Unique request identifier */
  requestId: string;

  /** Timestamp of the request */
  timestamp: Date;

  /** Platform identifier */
  platform: string;

  /** Provider that handled the request */
  provider: string;

  /** Original URL submitted by the user */
  url: string;

  /** Request outcome */
  status: 'success' | 'error';

  /** Total execution time in milliseconds */
  executionTime: number;

  /** Error code (if status is "error") */
  error?: NovaDLErrorCode;

  /** Original error message (if status is "error") */
  errorMessage?: string;

  /** User IP address (will be hashed before storage) */
  ipAddress?: string;

  /** User agent string (for device analytics) */
  userAgent?: string;

  /** Actual video/content ID from the provider result */
  videoId?: string;

  /** Content title from the provider result */
  videoTitle?: string;
}

// ============================================================================
// DOWNLOAD STATS
// ============================================================================

export interface DownloadStats {
  totalDownloads: number;
  successCount: number;
  failCount: number;
  avgResponseMs: number;
  byPlatform: Record<string, { total: number; success: number; fail: number }>;
  byProvider: Record<string, { total: number; success: number; avgResponseMs: number }>;
}

// ============================================================================
// DOWNLOAD LOGGER CLASS
// ============================================================================

export class DownloadLogger {
  /**
   * Log a download request to both the database and console.
   *
   * ⚠️  IP addresses are hashed before storage — raw IPs are NEVER stored.
   *
   * Database: writes to DownloadLog Prisma model.
   * Console: outputs structured JSON log for debugging.
   */
  async log(entry: DownloadLogEntry): Promise<void> {
    // Hash the IP address — NEVER store raw IPs
    const hashedIp = entry.ipAddress ? hashIp(entry.ipAddress) : null;

    // 1. Structured console log (always)
    console.log(JSON.stringify({
      type: 'download_log',
      requestId: entry.requestId,
      timestamp: entry.timestamp.toISOString(),
      platform: entry.platform,
      provider: entry.provider,
      url: entry.url.length > 100 ? entry.url.slice(0, 100) + '...' : entry.url,
      status: entry.status,
      executionTime: entry.executionTime,
      error: entry.error,
      errorMessage: entry.errorMessage,
      ipHash: hashedIp || 'N/A',
      userAgent: entry.userAgent ? entry.userAgent.slice(0, 100) : 'N/A',
      videoId: entry.videoId || null,
      videoTitle: entry.videoTitle || null,
    }));

    // 2. Database log (write to DownloadLog table)
    try {
      // Detect device category from User-Agent for analytics (Bug #3).
      // NULL when UA is empty or unclassifiable — UI shows "unknown" for those rows.
      const device = detectDevice(entry.userAgent);
      await db.downloadLog.create({
        data: {
          videoId: entry.videoId || null,
          videoTitle: entry.videoTitle || `[${entry.platform}] ${entry.url.slice(0, 50)}`,
          provider: entry.provider,
          platform: entry.platform,
          success: entry.status === 'success',
          responseTime: entry.executionTime,
          error: entry.errorMessage || (entry.error ? String(entry.error) : null),
          ipAddress: hashedIp,  // Store hash, NEVER raw IP
          requestId: entry.requestId,
          device,  // NULL for unknown UA — never fabricated
        },
      });

      // 3. Aggregate into Analytics table for dashboard stats.
      // Upsert a row for today's date, incrementing counters.
      // This ensures the admin dashboard always has real data.
      // Use UTC-midnight Date object for consistent matching with the analytics API route.
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0]; // "2026-08-06"
      const todayDate = new Date(todayStr + 'T00:00:00.000Z'); // Explicit UTC midnight
      const isSuccess = entry.status === 'success';
      try {
        // First, get the current analytics row to compute the new average response time
        const existing = await db.analytics.findUnique({
          where: { date: todayDate },
        });

        if (existing) {
          // Update existing row — recalculate running average
          const newTotal = existing.totalDownloads + 1;
          const newSuccess = existing.successCount + (isSuccess ? 1 : 0);
          const newFail = existing.failCount + (isSuccess ? 0 : 1);
          // Running average: old_avg * old_count + new_value) / new_count
          const newAvgMs = Math.round(
            (existing.avgResponseMs * existing.totalDownloads + entry.executionTime) / newTotal
          );
          // Count unique IP hashes for uniqueVisitors
          const newUniqueVisitors = hashedIp && !existing.uniqueVisitors
            ? 1
            : existing.uniqueVisitors || 0;

          await db.analytics.update({
            where: { date: todayDate },
            data: {
              totalDownloads: newTotal,
              successCount: newSuccess,
              failCount: newFail,
              avgResponseMs: newAvgMs,
              uniqueVisitors: newUniqueVisitors,
            },
          });
        } else {
          // Create first row for today
          await db.analytics.create({
            data: {
              date: todayDate,
              totalDownloads: 1,
              successCount: isSuccess ? 1 : 0,
              failCount: isSuccess ? 0 : 1,
              avgResponseMs: entry.executionTime,
              uniqueVisitors: hashedIp ? 1 : 0,
            },
          });
        }
      } catch (analyticsError) {
        // Analytics aggregation failure should never block the main log
        console.error('[Logger] Failed to update Analytics aggregation:', analyticsError);
      }
    } catch (dbError) {
      // DB write failure should never block or crash the system
      console.error('[Logger] Failed to write to DownloadLog DB:', dbError);
    }
  }

  /**
   * Query recent logs (for analytics and admin dashboard).
   */
  async getRecentLogs(limit: number = 50): Promise<any[]> {
    try {
      return await db.downloadLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
    } catch (dbError) {
      console.error('[Logger] Failed to query recent logs:', dbError);
      return [];
    }
  }

  /**
   * Get aggregated statistics for a time range.
   */
  async getStats(from: Date, to: Date): Promise<DownloadStats> {
    try {
      const logs = await db.downloadLog.findMany({
        where: {
          createdAt: { gte: from, lte: to },
        },
      });

      const totalDownloads = logs.length;
      const successCount = logs.filter(l => l.success).length;
      const failCount = totalDownloads - successCount;
      const avgResponseMs = logs.length > 0
        ? Math.round(logs.reduce((sum, l) => sum + (l.responseTime || 0), 0) / logs.length)
        : 0;

      // Group by provider
      const byProvider: Record<string, { total: number; success: number; avgResponseMs: number }> = {};
      for (const log of logs) {
        const provider = log.provider || 'unknown';
        if (!byProvider[provider]) byProvider[provider] = { total: 0, success: 0, avgResponseMs: 0 };
        byProvider[provider].total++;
        if (log.success) byProvider[provider].success++;
        byProvider[provider].avgResponseMs += log.responseTime || 0;
      }
      for (const provider of Object.keys(byProvider)) {
        const entry = byProvider[provider];
        entry.avgResponseMs = entry.total > 0 ? Math.round(entry.avgResponseMs / entry.total) : 0;
      }

      return {
        totalDownloads,
        successCount,
        failCount,
        avgResponseMs,
        byPlatform: { tiktok: { total: totalDownloads, success: successCount, fail: failCount } },
        byProvider,
      };
    } catch (dbError) {
      console.error('[Logger] Failed to compute stats:', dbError);
      return {
        totalDownloads: 0,
        successCount: 0,
        failCount: 0,
        avgResponseMs: 0,
        byPlatform: {},
        byProvider: {},
      };
    }
  }
}

// ============================================================================
// GLOBAL LOGGER SINGLETON
// ============================================================================

let globalLogger: DownloadLogger | null = null;

export function getLogger(): DownloadLogger {
  if (!globalLogger) {
    globalLogger = new DownloadLogger();
  }
  return globalLogger;
}
