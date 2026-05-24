import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv, serverEnv } from '../env';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          // Called from a Server Component — Next forbids cookie mutations there;
          // middleware will refresh the cookies on the next request.
        }
      },
    },
  });
}

/**
 * Service-role client. NEVER expose this to the client. Use only in
 * server-side code paths that intentionally bypass RLS (Inngest callbacks,
 * background jobs). Always filter by org_id manually in such paths.
 */
export function createSupabaseServiceRoleClient() {
  const env = serverEnv();
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
