import { z, ZodError, type ZodTypeAny } from 'zod';
import type { Result, ActionError, OrgRole } from '@cr/shared';
import { getContext, type AppContext } from './auth';

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(error: ActionError): Result<never> {
  return { ok: false, error };
}

export function fromZodError(e: ZodError): ActionError {
  return {
    code: 'validation',
    message: 'Invalid input',
    fieldErrors: e.flatten().fieldErrors as Record<string, string[]>,
  };
}

interface ActionOpts {
  roles?: OrgRole[];
}

/**
 * Wraps a server action with auth + role check + Zod validation +
 * uniform Result<T, ActionError> output. Throws are caught and turned
 * into { code: 'internal' } so client code can render them safely.
 */
export function defineAction<Schema extends ZodTypeAny, R>(
  schema: Schema,
  handler: (input: z.infer<Schema>, ctx: AppContext) => Promise<R>,
  opts: ActionOpts = {},
) {
  return async (rawInput: unknown): Promise<Result<R>> => {
    try {
      const parsed = schema.safeParse(rawInput);
      if (!parsed.success) return fail(fromZodError(parsed.error));

      const ctx = await getContext();
      if (opts.roles && !opts.roles.includes(ctx.role)) {
        return fail({ code: 'forbidden', message: 'Insufficient permissions' });
      }

      const data = await handler(parsed.data, ctx);
      return ok(data);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Forbidden')) {
        return fail({ code: 'forbidden', message: err.message });
      }
      console.error('[action] internal error', err);
      return fail({
        code: 'internal',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };
}
