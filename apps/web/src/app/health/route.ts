import { NextResponse } from 'next/server';
import { getSystemHealth } from '@/server/system/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getSystemHealth();
  return NextResponse.json(health, { status: health.status === 'down' ? 503 : 200 });
}
