import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import {
  getExtractionArtifact,
  getExtractionArtifactUrls,
  listExtractionArtifacts,
  replayExtractionArtifact,
} from '@/server/debug/extractions';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type SearchParams = { id?: string };

function statusVariant(status: string) {
  if (status === 'ok') return 'success';
  if (status === 'parse_failed') return 'warning';
  return 'destructive';
}

export default async function DebugExtractionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getContext();
  const params = await searchParams;
  const [rows, selected, replay] = await Promise.all([
    listExtractionArtifacts(ctx.orgId, 50),
    params.id ? getExtractionArtifact(ctx.orgId, params.id) : Promise.resolve(null),
    params.id ? replayExtractionArtifact(ctx.orgId, params.id).catch((err) => ({ ok: false, error: err })) : null,
  ]);
  const signedUrls = params.id ? await getExtractionArtifactUrls(ctx.orgId, params.id).catch(() => null) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <section className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Extraction debug</h1>
          <p className="text-sm text-muted-foreground">Saved HTML snapshots, selectors, confidence, and replay output.</p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Recent artifacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No extraction artifacts yet.</p>
            ) : (
              rows.map(({ artifact, storeName, productTitle }) => (
                <Link
                  key={artifact.id}
                  href={`/debug/extractions?id=${artifact.id}`}
                  className="block rounded-md border p-3 text-sm transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{productTitle ?? artifact.url}</span>
                    <Badge variant={statusVariant(artifact.status)}>{artifact.status}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{storeName ?? artifact.url}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{timeAgo(artifact.createdAt)}</p>
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
                <CardTitle>Replay result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(replay, null, 2)}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Archive</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 lg:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">HTML key</p>
                    <p className="break-all font-mono text-xs">{selected.artifact.htmlStorageKey ?? 'not stored'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Screenshot key</p>
                    <p className="break-all font-mono text-xs">{selected.artifact.screenshotStorageKey ?? 'not stored'}</p>
                  </div>
                </div>
                {signedUrls?.screenshotUrl ? (
                  <Image
                    src={signedUrls.screenshotUrl}
                    alt="Extraction screenshot"
                    width={1280}
                    height={720}
                    unoptimized
                    className="max-h-[480px] w-full rounded-md border object-contain"
                  />
                ) : null}
                {signedUrls?.htmlUrl ? (
                  <a className="text-primary underline-offset-4 hover:underline" href={signedUrls.htmlUrl}>
                    Open archived HTML
                  </a>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Selectors and confidence</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(selected.artifact.selectorSetJson, null, 2)}
                </pre>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(selected.artifact.confidenceJson, null, 2)}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>HTML snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[520px] overflow-auto rounded-md bg-muted p-3 text-xs">
                  {selected.artifact.htmlSnapshot ?? 'No HTML snapshot stored'}
                </pre>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Select an extraction artifact to inspect replay state.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
