import { NextResponse } from 'next/server';
import { checkStorageHealth } from '@/server/system/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const check = await checkStorageHealth();
  return NextResponse.json(check, { status: check.status === 'down' ? 503 : 200 });
}
