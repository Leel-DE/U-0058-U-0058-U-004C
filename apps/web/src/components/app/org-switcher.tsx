'use client';

import { ChevronsUpDown, Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { switchOrganization } from '@/server/actions/org';
import { toast } from 'sonner';

interface Props {
  current: { id: string; name: string; role: string };
  orgs: { id: string; name: string; slug: string; role: string }[];
}

export function OrgSwitcher({ current, orgs }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  function pick(orgId: string) {
    if (orgId === current.id) return setOpen(false);
    start(async () => {
      const r = await switchOrganization({ orgId });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-[180px] justify-between gap-2" disabled={pending}>
          <span className="truncate">{current.name}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => pick(o.id)}>
            <span className="flex-1 truncate">{o.name}</span>
            <span className="text-xs text-muted-foreground">{o.role}</span>
            {o.id === current.id ? <Check className="ml-2 h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
