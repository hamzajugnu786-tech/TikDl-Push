import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  // Authentication guard — analytics are admin-only data
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    // Use UTC-consistent date normalization to match how the logger writes Analytics rows
    // The logger uses: new Date().toISOString().split('T')[0] which is always UTC midnight
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // "2026-08-06"
    const today = new Date(todayStr + 'T00:00:00.000Z'); // UTC midnight

    const sevenDaysAgoStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(sevenDaysAgoStr + 'T00:00:00.000Z');

    // Parallelise independent DB queries for better performance
    const [todayAnalytics, last7Days, providerStatuses, recentLogs, todayLogCount,
      // DownloadLog-based fallback queries (used when Analytics table is empty/missing)
      totalLogCount, successLogCount, todaySuccessLogCount, avgResponseFromLogs,
      // Device-breakdown counts from DownloadLog (Bug #3 — real device analytics)
      deviceCounts, last30DaysLogCount
    ] =
      await Promise.all([
        db.analytics.findUnique({ where: { date: today } }),
        db.analytics.findMany({
          where: { date: { gte: sevenDaysAgo } },
          orderBy: { date: 'desc' },
        }),
        db.providerStatus.findMany(),
        db.downloadLog.findMany({
          take: 50,
          orderBy: { createdAt: 'desc' },
        }),
        db.downloadLog.count({
          where: { createdAt: { gte: today } },
        }),
        // Fallback: total all-time download count from DownloadLog
        db.downloadLog.count(),
        // Fallback: total all-time success count from DownloadLog
        db.downloadLog.count({ where: { success: true } }),
        // Fallback: today's success count from DownloadLog
        db.downloadLog.count({ where: { success: true, createdAt: { gte: today } } }),
        // Fallback: average response time from recent DownloadLog entries
        db.downloadLog.findMany({
          where: { responseTime: { not: null }, createdAt: { gte: sevenDaysAgo } },
          select: { responseTime: true },
        }),
        // ===== Device breakdown (Bug #3) =====
        // Count recent logs grouped by device category. We fetch all recent
        // logs and group in JS because Prisma's `groupBy` on a nullable field
        // can be awkward and SQLite/LibSQL support varies. This is bounded by
        // the 7-day window and 50-recent-logs limit.
        db.downloadLog.findMany({
          where: { createdAt: { gte: sevenDaysAgo } },
          select: { device: true, success: true },
        }),
        // Last 30-day count for monthly view
        db.downloadLog.count({
          where: { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
        }),
      ]);

    // Aggregate device counts from the recent-logs query above.
    // NULL device entries are reported as "unknown" — never fabricated.
    const deviceSummary: { mobile: number; desktop: number; tablet: number; unknown: number } = {
      mobile: 0,
      desktop: 0,
      tablet: 0,
      unknown: 0,
    };
    for (const log of deviceCounts) {
      const d = log.device;
      if (d === 'mobile') deviceSummary.mobile++;
      else if (d === 'desktop') deviceSummary.desktop++;
      else if (d === 'tablet') deviceSummary.tablet++;
      else deviceSummary.unknown++;
    }

    // Compute stats from Analytics table, with DownloadLog fallback
    // When Analytics rows exist, use them. When empty, compute from DownloadLog.
    const analyticsHasData = last7Days.length > 0 && last7Days.some(d => d.totalDownloads > 0);

    let totalDownloads: number;
    let totalSuccess: number;
    let totalFail: number;
    let avgResponseMs: number;

    if (analyticsHasData) {
      // Use Analytics table data (authoritative, pre-aggregated)
      totalDownloads = last7Days.reduce((sum, day) => sum + day.totalDownloads, 0);
      totalSuccess = last7Days.reduce((sum, day) => sum + day.successCount, 0);
      totalFail = last7Days.reduce((sum, day) => sum + day.failCount, 0);
      const daysWithResponseData = last7Days.filter((d) => d.avgResponseMs > 0);
      avgResponseMs = daysWithResponseData.length > 0
        ? Math.round(daysWithResponseData.reduce((sum, d) => sum + d.avgResponseMs, 0) / daysWithResponseData.length)
        : 0;
    } else {
      // Analytics table is empty or has no data — fall back to DownloadLog
      totalDownloads = totalLogCount;
      totalSuccess = successLogCount;
      totalFail = totalLogCount - successLogCount;
      avgResponseMs = avgResponseFromLogs.length > 0
        ? Math.round(avgResponseFromLogs.reduce((sum, l) => sum + (l.responseTime || 0), 0) / avgResponseFromLogs.length)
        : 0;
    }

    // Build last7Days response — if Analytics table is empty, synthesize from DownloadLog
    let last7DaysResponse: Array<{ date: string; totalDownloads: number; successCount: number; failCount: number; avgResponseMs: number; uniqueVisitors: number }>;
    if (last7Days.length > 0) {
      last7DaysResponse = last7Days.map((d) => ({
        date: d.date.toISOString().split('T')[0],
        totalDownloads: d.totalDownloads,
        successCount: d.successCount,
        failCount: d.failCount,
        avgResponseMs: d.avgResponseMs,
        uniqueVisitors: d.uniqueVisitors,
      }));
    } else {
      // No Analytics rows — create a single entry for today from DownloadLog counts
      last7DaysResponse = todayLogCount > 0 ? [{
        date: todayStr,
        totalDownloads: todayLogCount,
        successCount: todaySuccessLogCount,
        failCount: todayLogCount - todaySuccessLogCount,
        avgResponseMs: avgResponseFromLogs.length > 0
          ? Math.round(avgResponseFromLogs.reduce((sum, l) => sum + (l.responseTime || 0), 0) / avgResponseFromLogs.length)
          : 0,
        uniqueVisitors: 0,
      }] : [];
    }

    return NextResponse.json({
      success: true,
      today: todayAnalytics
        ? {
            totalDownloads: todayAnalytics.totalDownloads,
            successCount: todayAnalytics.successCount,
            failCount: todayAnalytics.failCount,
            avgResponseMs: todayAnalytics.avgResponseMs,
            uniqueVisitors: todayAnalytics.uniqueVisitors,
          }
        : {
            totalDownloads: todayLogCount,
            successCount: todaySuccessLogCount,
            failCount: todayLogCount - todaySuccessLogCount,
            avgResponseMs: avgResponseFromLogs.length > 0
              ? Math.round(avgResponseFromLogs.reduce((sum, l) => sum + (l.responseTime || 0), 0) / avgResponseFromLogs.length)
              : 0,
            uniqueVisitors: 0,
          },
      last7Days: last7DaysResponse,
      summary: {
        totalDownloads,
        totalSuccess,
        totalFail,
        avgResponseMs,
        successRate:
          totalDownloads > 0
            ? Math.round((totalSuccess / totalDownloads) * 100)
            : 0,
      },
      providers: providerStatuses.map((p) => ({
        name: p.name,
        platform: p.platform,
        active: p.active,
        successRate: p.successRate,
        avgResponseMs: p.avgResponseMs,
        lastCheck: p.lastCheck.toISOString(),
      })),
      recentLogs: recentLogs.map((l) => ({
        id: l.id,
        videoId: l.videoId,
        videoTitle: l.videoTitle,
        provider: l.provider,
        platform: l.platform,
        success: l.success,
        responseTime: l.responseTime,
        error: l.error,
        createdAt: l.createdAt.toISOString(),
        device: l.device,  // May be NULL for historical rows — UI shows "unknown"
      })),
      // ===== Device breakdown (Bug #3) =====
      // Real counts derived from DownloadLog.device. NULL device entries are
      // reported as "unknown" — never fabricated. When all historical rows
      // have NULL device (i.e. all counts are 0 except unknown), the UI shows
      // "no device data yet" instead of fake percentages.
      deviceBreakdown: deviceSummary,
      last30DaysCount: last30DaysLogCount,
    });
  } catch {
    // Return zeros on error — never return an error status
    return NextResponse.json({
      success: true,
      today: {
        totalDownloads: 0,
        successCount: 0,
        failCount: 0,
        avgResponseMs: 0,
        uniqueVisitors: 0,
      },
      last7Days: [],
      summary: {
        totalDownloads: 0,
        totalSuccess: 0,
        totalFail: 0,
        avgResponseMs: 0,
        successRate: 0,
      },
      providers: [],
      recentLogs: [],
      deviceBreakdown: { mobile: 0, desktop: 0, tablet: 0, unknown: 0 },
      last30DaysCount: 0,
    });
  }
}
