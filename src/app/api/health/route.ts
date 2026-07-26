import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    // Simple query to check database connectivity
    await db.user.count();

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      timestamp,
    });
  } catch {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'disconnected',
        timestamp,
      },
      { status: 503 }
    );
  }
}
