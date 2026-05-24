'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { schemas } from '@cr/shared';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/form-message';
import { createOrganization } from '@/server/actions/org';

type FormValues = { name: string; slug: string };

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function OnboardingForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schemas.createOrganizationSchema),
    defaultValues: { name: '', slug: '' },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createOrganization(values);
      if (!result.ok) {
        for (const [field, errs] of Object.entries(result.error.fieldErrors ?? {})) {
          form.setError(field as keyof FormValues, { message: errs?.[0] });
        }
        if (!result.error.fieldErrors) {
          form.setError('root', { message: result.error.message });
        }
        return;
      }
      toast.success('Organization created');
      router.replace('/dashboard');
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-1.5">
        <Label htmlFor="name">Organization name</Label>
        <Input
          id="name"
          autoFocus
          {...form.register('name', {
            onChange: (e) => {
              if (!form.formState.dirtyFields.slug) {
                form.setValue('slug', slugify(e.target.value), { shouldDirty: false });
              }
            },
          })}
        />
        <FormError message={form.formState.errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" {...form.register('slug')} />
        <p className="text-xs text-muted-foreground">Lowercase letters, digits and dashes.</p>
        <FormError message={form.formState.errors.slug?.message} />
      </div>
      <FormError message={form.formState.errors.root?.message} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating…' : 'Create organization'}
      </Button>
    </form>
  );
}
