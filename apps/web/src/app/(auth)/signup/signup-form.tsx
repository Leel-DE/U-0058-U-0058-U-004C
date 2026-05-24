'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/form-message';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { publicEnv } from '@/lib/env';

const schema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8, 'At least 8 characters'),
});
type FormValues = z.infer<typeof schema>;

export function SignupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error, data } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { full_name: values.fullName },
          emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/onboarding`,
        },
      });
      if (error) {
        form.setError('root', { message: error.message });
        return;
      }
      if (data.session) {
        // Email confirmation disabled — go straight to onboarding.
        toast.success('Account created');
        router.replace('/onboarding');
        router.refresh();
      } else {
        toast.success('Check your email to confirm your account.');
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" autoComplete="name" {...form.register('fullName')} />
        <FormError message={form.formState.errors.fullName?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        <FormError message={form.formState.errors.email?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
        <FormError message={form.formState.errors.password?.message} />
      </div>
      <FormError message={form.formState.errors.root?.message} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
