import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { functions } from '@/lib/inngest/functions';

export const { GET, POST, PUT } = serve({ client: inngest, functions });

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
