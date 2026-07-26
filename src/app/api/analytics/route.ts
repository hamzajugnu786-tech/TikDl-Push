import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Today's analytics
    const todayAnalytics = await db.analytics.findUnique({
      where: { date: today },
    });

    // Last 7 days analytics
    const last7Days = await db.analytics.findMany({
      where: { date: { gte: sevenDaysAgo } },
      orderBy: { date: 'desc' },
    });

    // Total downloads from all analytics records
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

    // Average response time across available days
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

    // Provider status
    const providerStatuses = await db.providerStatus.findMany();

    // Recent download logs (last 50)
    const recentLogs = await db.downloadLog.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    // Today's download logs count
    const todayLogCount = await db.downloadLog.count({
      where: {
        createdAt: { gte: today },
      },
    });

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
