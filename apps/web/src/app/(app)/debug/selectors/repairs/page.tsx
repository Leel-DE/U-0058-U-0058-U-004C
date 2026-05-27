import Link from 'next/link';
import { RotateCcw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import { timeAgo } from '@/lib/utils';
import {
  applySelectorRepairAction,
  rejectSelectorRepairAction,
  retrySelectorRepairAction,
} from '@/server/actions/selectors';
import { getSelectorRepairAttempts } from '@/server/selectors/get-selector-repair-attempts';
import { getSelectorRepairDetail } from '@/server/selectors/get-selector-repair-detail';

export const dynamic = 'force-dynamic';

type SearchParams = { id?: string };

function statusVariant(status: string) {
  if (status === 'applied' || status === 'validated') return 'success';
  if (status === 'pending' || status === 'suggested') return 'warning';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

function JsonBlock({ value, empty = 'none' }: { value: unknown; empty?: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
      {value == null ? empty : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function SelectorRepairsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getContext();
  const params = await searchParams;
  const [rows, selected] = await Promise.all([
    getSelectorRepairAttempts(ctx.orgId, 100),
    params.id ? getSelectorRepairDetail(ctx.orgId, params.id) : Promise.resolve(null),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-[460px_1fr]">
      <section className="space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Selector repairs</h1>
            <p className="text-sm text-muted-foreground">AI suggestions, local validation, apply state, and retry results.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/debug/selectors">History</Link>
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Attempts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No selector repair attempts yet.</p>
            ) : (
              rows.map(({ attempt, storeName, productTitle, productUrl }) => (
                <Link
                  key={attempt.id}
                  href={`/debug/selectors/repairs?id=${attempt.id}`}
                  className="block rounded-md border p-3 text-sm transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{productTitle ?? productUrl ?? 'Unknown product'}</span>
                    <Badge variant={statusVariant(attempt.status)}>{attempt.status}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{storeName ?? 'Unknown competitor'}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{attempt.triggerReason}</span>
                    <span>{timeAgo(attempt.createdAt)}</span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        {selected ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>Repair detail</span>
                  <Badge variant={statusVariant(selected.attempt.status)}>{selected.attempt.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Competitor</p>
                    <p>{selected.store?.name ?? 'n/a'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Product</p>
                    <p className="break-all">{selected.product?.title ?? selected.product?.url ?? 'n/a'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Confidence</p>
                    <p>{selected.attempt.confidence ?? 'n/a'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">AI</p>
                    <p>{[selected.attempt.aiProvider, selected.attempt.aiModel].filter(Boolean).join(' / ') || 'n/a'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selected.attempt.status === 'suggested' || selected.attempt.status === 'validated' ? (
                    <>
                      <form
                        action={async () => {
                          'use server';
                          await applySelectorRepairAction({ attemptId: selected.attempt.id });
                        }}
                      >
                        <Button type="submit" size="sm">Apply suggestion</Button>
                      </form>
                      <form
                        action={async () => {
                          'use server';
                          await rejectSelectorRepairAction({ attemptId: selected.attempt.id });
                        }}
                      >
                        <Button type="submit" variant="outline" size="sm">Reject</Button>
                      </form>
                    </>
                  ) : null}
                  <form
                    action={async () => {
                      'use server';
                      await retrySelectorRepairAction({ attemptId: selected.attempt.id });
                    }}
                  >
                    <Button type="submit" variant="outline" size="sm">
                      <RotateCcw className="h-4 w-4" />
                      Retry repair
                    </Button>
                  </form>
                  {selected.artifact ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/debug/extractions?id=${selected.artifact.id}`}>Open artifact</Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href="/debug/selectors">Rollback selector</Link>
                  </Button>
                </div>

                {selected.attempt.error ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                    {selected.attempt.error}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Old selectors</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonBlock value={selected.attempt.oldSelectorsJson} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Suggested selectors</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonBlock value={selected.attempt.suggestedSelectorsJson} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Validation</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonBlock value={selected.attempt.validationResultJson} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Applied selectors and retry result</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <JsonBlock value={selected.attempt.appliedSelectorsJson} />
                <JsonBlock value={selected.attempt.retryResultJson} />
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Select a repair attempt to inspect AI output, validation, and retry state.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
