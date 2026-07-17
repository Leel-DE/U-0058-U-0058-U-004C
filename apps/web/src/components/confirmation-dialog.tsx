'use client';

import { useId, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ConfirmationDialogProps {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  confirmationText?: string;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}

export function ConfirmationDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  confirmationText,
  disabled,
  onConfirm,
}: ConfirmationDialogProps) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmed = !confirmationText || value === confirmationText;

  function submit() {
    if (!confirmed || pending) return;
    startTransition(async () => {
      try {
        await onConfirm();
        setOpen(false);
        setValue('');
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The action failed. Try again.');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {confirmationText ? (
          <div className="grid gap-2">
            <Label htmlFor={inputId}>
              Type <span className="font-mono">{confirmationText}</span> to continue
            </Label>
            <Input
              id={inputId}
              name="confirmation"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
        {error ? <p className="text-destructive text-base sm:text-sm">{error}</p> : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!confirmed || pending}
            onClick={submit}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
