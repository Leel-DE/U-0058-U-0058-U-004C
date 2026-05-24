'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Store,
  Package,
  GitMerge,
  Bell,
  ListTodo,
  BarChart3,
  Download,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/competitors', label: 'Competitors', icon: Store },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/matches', label: 'Matches', icon: GitMerge },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/jobs', label: 'Jobs', icon: ListTodo },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/exports', label: 'Exports', icon: Download },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="px-6 py-5">
        <Link href="/dashboard" className="text-base font-bold tracking-tight">
          Competitor Radar
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 text-xs text-muted-foreground">
        <p>v0.1 · ethical scraping mode</p>
      </div>
    </aside>
  );
}
