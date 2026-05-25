import Link from 'next/link';
import { ReactNode } from 'react';

const TABS = [
  { href: '/settings/general', label: 'General' },
  { href: '/settings/project', label: 'Project status' },
  { href: '/settings/members', label: 'Members' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/api-keys', label: 'API keys' },
  { href: '/settings/danger', label: 'Danger zone' },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="space-y-1">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div>{children}</div>
      </div>
    </div>
  );
}
