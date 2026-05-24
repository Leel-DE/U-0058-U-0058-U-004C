'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  bulkImportCompetitorProducts,
  bulkImportMyProducts,
} from '@/server/actions/products';

interface Props {
  mode: 'myProducts' | 'competitorProducts';
  storeId?: string;
  helpText?: string;
}

export function BulkImport({ mode, storeId, helpText }: Props) {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [pending, start] = useTransition();

  function importIt() {
    if (!csv.trim()) return;
    start(async () => {
      const r =
        mode === 'myProducts'
          ? await bulkImportMyProducts({ csv, currency: 'EUR' })
          : await bulkImportCompetitorProducts({ csv, storeId: storeId! });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Imported ${r.data.imported}, skipped ${r.data.skipped}`);
      setCsv('');
      router.refresh();
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setCsv);
  }

  return (
    <div className="space-y-3">
      {helpText ? <p className="text-xs text-muted-foreground">{helpText}</p> : null}
      <div>
        <Label htmlFor="csvFile">Upload CSV file</Label>
        <input
          id="csvFile"
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="block w-full text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="csvText">…or paste CSV</Label>
        <Textarea
          id="csvText"
          rows={10}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={
            mode === 'myProducts'
              ? 'sku,name,brand,gtin,price\nHP-2000,Acme HP-2000,Acme,0123456789012,199.00'
              : 'url,external_id,title\nhttps://shop.example.com/x,EXT-1,Product X'
          }
        />
      </div>
      <Button disabled={pending || !csv.trim()} onClick={importIt}>
        {pending ? 'Importing…' : 'Import'}
      </Button>
    </div>
  );
}
