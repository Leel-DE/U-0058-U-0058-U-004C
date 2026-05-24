import { z } from 'zod';

const ServerEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),
  WORKER_URL: z.string().url(),
  WORKER_SHARED_SECRET: z.string().min(8),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

const PublicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

let _serverEnv: z.infer<typeof ServerEnv> | undefined;
export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() called from the browser');
  }
  if (!_serverEnv) {
    const parsed = ServerEnv.safeParse(process.env);
    if (!parsed.success) {
      console.error('Invalid env:', parsed.error.flatten().fieldErrors);
      throw new Error('Invalid server environment');
    }
    _serverEnv = parsed.data;
  }
  return _serverEnv;
}

export const publicEnv = PublicEnv.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});
