import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="bg-muted text-foreground hidden flex-col justify-between p-10 lg:flex">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Automation Hub
        </Link>
        <blockquote className="space-y-2">
          <p className="text-lg">
            “Ethical price intelligence — we respect robots.txt and never bypass anti-bot
            protections. SMBs deserve to compete without playing dirty.”
          </p>
          <footer className="text-muted-foreground text-sm">— our founding principle</footer>
        </blockquote>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  );
}
