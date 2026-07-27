import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  // Authentication guard — analytics are admin-only data
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Parallelise independent DB queries for better performance
    const [todayAnalytics, last7Days, providerStatuses, recentLogs, todayLogCount] =
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
      ]);

    const totalDownloads = last7Days.reduce(
      (sum, day) => sum + day.totalDownloads,
      0
    );
    const totalSuccess = last7Days.reduce(
      (sum, day) => sum + day.successCount,
      0
    );
    const totalFail = last7Days.reduce(
      (sum, day) => sum + day.failCount,
      0
    );

    const daysWithResponseData = last7Days.filter(
      (d) => d.avgResponseMs > 0
    );
    const avgResponseMs =
      daysWithResponseData.length > 0
        ? Math.round(
            daysWithResponseData.reduce(
              (sum, d) => sum + d.avgResponseMs,
              0
            ) / daysWithResponseData.length
          )
        : 0;

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
            successCount: 0,
            failCount: 0,
            avgResponseMs: 0,
            uniqueVisitors: 0,
          },
      last7Days: last7Days.map((d) => ({
        date: d.date.toISOString().split('T')[0],
        totalDownloads: d.totalDownloads,
        successCount: d.successCount,
        failCount: d.failCount,
        avgResponseMs: d.avgResponseMs,
        uniqueVisitors: d.uniqueVisitors,
      })),
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
      })),
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
    });
  }
}
