'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { NavLinks } from './sidebar';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="left-0 top-0 h-dvh max-w-[300px] translate-x-0 translate-y-0 overflow-y-auto rounded-none p-0">
        <DialogTitle className="px-6 py-5">Automation Hub</DialogTitle>
        <NavLinks onNavigate={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
