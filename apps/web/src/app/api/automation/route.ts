import { NextResponse } from 'next/server';
import { getContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await getContext();
  const workerUrl = process.env.WORKER_URL ?? 'http://127.0.0.1:4000';
  const secret = process.env.WORKER_SHARED_SECRET ?? '';
  const incomingUrl = new URL(request.url);
  const after = incomingUrl.searchParams.get('after');
  const query = new URLSearchParams({ limit: '100' });
  if (after) query.set('after', after);

  try {
    const [statusResponse, eventsResponse] = await Promise.all([
      fetch(`${workerUrl}/automation/status`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      }),
      fetch(`${workerUrl}/automation/events?${query}`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      }),
    ]);
    if (!statusResponse.ok || !eventsResponse.ok) {
      return NextResponse.json(
        { ok: false, message: 'Automation worker is unavailable. Radar will keep trying.' },
        { status: 503 },
      );
    }
    const status = await statusResponse.json();
    const events = await eventsResponse.json();
    return NextResponse.json({
      ok: true,
      automationHub: status.automationHub,
      events: events.events,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Automation worker is unavailable. Radar will keep trying.' },
      { status: 503 },
    );
  }
}
