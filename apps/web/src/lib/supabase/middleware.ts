import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { publicEnv } from '../env';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Refreshes the Supabase auth cookie on every request and protects
 * authenticated app routes. Public routes pass through untouched.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Treat any auth failure (network down, Supabase misconfigured) as "no user"
  // so the request still resolves — the redirect below handles protection.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.warn('[middleware] supabase.auth.getUser failed:', (err as Error).message);
  }

  const url = request.nextUrl;
  const isAppRoute =
    url.pathname.startsWith('/dashboard') ||
    url.pathname.startsWith('/competitors') ||
    url.pathname.startsWith('/products') ||
    url.pathname.startsWith('/matches') ||
    url.pathname.startsWith('/alerts') ||
    url.pathname.startsWith('/jobs') ||
    url.pathname.startsWith('/automation') ||
    url.pathname.startsWith('/analytics') ||
    url.pathname.startsWith('/exports') ||
    url.pathname.startsWith('/settings') ||
    url.pathname.startsWith('/onboarding');

  if (isAppRoute && !user) {
    const redirect = url.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', url.pathname);
    return NextResponse.redirect(redirect);
  }

  if ((url.pathname === '/login' || url.pathname === '/signup') && user) {
    const redirect = url.clone();
    redirect.pathname = '/dashboard';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}
