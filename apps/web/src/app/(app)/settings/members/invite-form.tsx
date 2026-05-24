'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { schemas } from '@cr/shared';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormError } from '@/components/form-message';
import { inviteMember } from '@/server/actions/org';
import { useRouter } from 'next/navigation';

type FormValues = { email: string; role: 'owner' | 'manager' | 'viewer' };

export function InviteForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schemas.inviteMemberSchema),
    defaultValues: { email: '', role: 'manager' },
  });

  function onSubmit(values: FormValues) {
    start(async () => {
      const r = await inviteMember(values);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Invitation created — share /accept-invite/${r.data.token}`);
      form.reset({ email: '', role: 'manager' });
      router.refresh();
    });
  }

  return (
    <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_auto]" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...form.register('email')} />
        <FormError message={form.formState.errors.email?.message} />
      </div>
      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select
          value={form.watch('role')}
          onValueChange={(v) => form.setValue('role', v as FormValues['role'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full md:w-auto">
          {pending ? 'Inviting…' : 'Send invite'}
        </Button>
      </div>
    </form>
  );
}
