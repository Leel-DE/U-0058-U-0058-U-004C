import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-muted p-10 text-foreground lg:flex">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Competitor Radar
        </Link>
        <blockquote className="space-y-2">
          <p className="text-lg">
            “Ethical price intelligence — we respect robots.txt and never bypass anti-bot
            protections. SMBs deserve to compete without playing dirty.”
          </p>
          <footer className="text-sm text-muted-foreground">— our founding principle</footer>
        </blockquote>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  );
}
