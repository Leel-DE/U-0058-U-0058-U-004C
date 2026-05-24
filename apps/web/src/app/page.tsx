import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-20 text-center">
      <h1 className="text-balance text-5xl font-bold tracking-tight">
        Ethical price intelligence for e-commerce
      </h1>
      <p className="max-w-2xl text-balance text-lg text-muted-foreground">
        Track competitor prices, availability and promotions. Get alerted on changes. Stay
        compliant — we respect robots.txt and never bypass anti-bot protections.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium transition hover:bg-accent"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
