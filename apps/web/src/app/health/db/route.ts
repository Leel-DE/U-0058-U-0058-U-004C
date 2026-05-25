import { NextResponse } from 'next/server';
import { checkDbHealth } from '@/server/system/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const check = await checkDbHealth();
  return NextResponse.json(check, { status: check.status === 'down' ? 503 : 200 });
}
