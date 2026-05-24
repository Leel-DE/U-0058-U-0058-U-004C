'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export function NotificationBell({ orgId, userId }: { orgId: string; userId: string }) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;

    supabase
      .from('notifications')
      .select('id, title, body, read_at, created_at')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (active && data) setItems(data as NotificationRow[]);
      });

    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setItems((prev) => [payload.new as NotificationRow, ...prev].slice(0, 10));
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [orgId, userId]);

  const unread = items.filter((i) => !i.read_at).length;

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen((s) => !s)}>
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
        ) : null}
      </Button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border bg-popover p-2 shadow-md">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 ? <Badge variant="secondary">{unread} new</Badge> : null}
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {items.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">All clear</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href="/alerts"
                  className="block rounded-md px-2 py-2 text-sm hover:bg-accent"
                  onClick={() => setOpen(false)}
                >
                  <div className="font-medium">{n.title}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
