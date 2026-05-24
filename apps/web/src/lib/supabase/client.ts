'use client';
import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '../env';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
