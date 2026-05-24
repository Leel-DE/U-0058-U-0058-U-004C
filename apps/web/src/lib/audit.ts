import { db, schema } from './db';

export async function logAudit(input: {
  orgId: string;
  userId?: string;
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}) {
  try {
    await db().insert(schema.auditLogs).values({
      orgId: input.orgId,
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: (input.before as object | undefined) ?? null,
      after: (input.after as object | undefined) ?? null,
    });
  } catch (err) {
    console.error('[audit] failed to log', err);
  }
}
