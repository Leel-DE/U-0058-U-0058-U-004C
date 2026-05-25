'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyableValue({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 ${className ?? ''}`}
      onClick={() => {
        if (typeof navigator === 'undefined' || !navigator.clipboard) return;
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      title={copied ? 'Copied!' : 'Copy'}
    >
      <span className="truncate">{value}</span>
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  );
}
