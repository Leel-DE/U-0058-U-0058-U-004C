'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Bell,
  Box,
  Bug,
  Download,
  GitMerge,
  HeartPulse,
  LayoutDashboard,
  ListTodo,
  Package,
  Settings,
  Store,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAV_GROUPS = [
  { label: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Competition',
    items: [
      { href: '/competitors', label: 'Competitors', icon: Store },
      { href: '/products', label: 'Products', icon: Package },
      { href: '/matches', label: 'Matches', icon: GitMerge },
      { href: '/alerts', label: 'Alerts', icon: Bell },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/shipments', label: 'Shipments', icon: Box },
      { href: '/jobs', label: 'Jobs', icon: ListTodo },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { href: '/automation', label: 'Automation', icon: Workflow },
      { href: '/provider-health', label: 'Provider health', icon: HeartPulse },
      { href: '/dead-letter', label: 'Dead letter', icon: TriangleAlert },
      { href: '/debug/extractions', label: 'Debug', icon: Bug },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/system/health', label: 'System', icon: Activity },
      { href: '/exports', label: 'Exports', icon: Download },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
] as const;

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 px-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-muted-foreground mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em]">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  onClick={onNavigate}
                  key={href}
                  href={href}
                  className={cn(
                    'focus-visible:ring-ring flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="bg-card hidden w-64 shrink-0 border-r md:flex md:flex-col">
      <div className="px-6 py-5">
        <Link href="/dashboard" className="block text-base font-bold tracking-tight">
          Automation Hub
        </Link>
        <p className="text-muted-foreground mt-0.5 text-[11px]">Competition · Shipments · More</p>
      </div>
      <NavLinks />
      <div className="text-muted-foreground p-4 text-xs">Local-first browser automation</div>
    </aside>
  );
}
