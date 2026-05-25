import { NextResponse } from 'next/server';
import { checkInngestHealth } from '@/server/system/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const check = await checkInngestHealth();
  return NextResponse.json(check, { status: check.status === 'down' ? 503 : 200 });
}
