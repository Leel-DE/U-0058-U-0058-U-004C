'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createExport, getExportDownloadUrl } from '@/server/actions/exports';

const KINDS = [
  { key: 'snapshots_csv', label: 'Snapshots (last 30 days) · CSV' },
  { key: 'products_csv', label: 'My products · CSV' },
  { key: 'matches_csv', label: 'Matches · CSV' },
  { key: 'analytics_xlsx', label: 'Analytics workbook · XLSX' },
] as const;

export function NewExportButtons() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function generate(kind: (typeof KINDS)[number]['key']) {
    start(async () => {
      const r = await createExport({ kind, params: {} });
      if (!r.ok) toast.error(r.error.message);
      else {
        toast.success('Export ready');
        router.refresh();
      }
    });
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={pending}>{pending ? 'Generating…' : 'New export'}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {KINDS.map((k) => (
          <DropdownMenuItem key={k.key} onSelect={() => generate(k.key)}>{k.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ExportActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  function download() {
    start(async () => {
      const r = await getExportDownloadUrl({ id });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      window.location.href = r.data.url;
    });
  }
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={download}>
      <Download className="mr-1 h-4 w-4" /> {pending ? '…' : 'Download'}
    </Button>
  );
}
