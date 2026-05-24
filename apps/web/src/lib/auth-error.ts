export function authErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'Failed to fetch' || error.message.includes('fetch')) {
      return 'Local Supabase is not reachable. Run pnpm setup:local or pnpm supabase:start, then try again.';
    }
    return error.message;
  }

  return 'Authentication failed. Check local Supabase and try again.';
}
