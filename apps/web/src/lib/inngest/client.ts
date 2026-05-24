import { EventSchemas, Inngest } from 'inngest';

type Events = {
  'store.scrape.requested': { data: { orgId: string; storeId: string; runId: string } };
  'product.scrape.requested': {
    data: { orgId: string; storeId: string; competitorProductId: string; runId?: string };
  };
  'alert.evaluated': {
    data: { orgId: string; alertRuleId: string; competitorProductId: string; payload: unknown };
  };
};

export const inngest = new Inngest({
  id: 'competitor-radar',
  schemas: new EventSchemas().fromRecord<Events>(),
});

export type CrEvents = Events;
