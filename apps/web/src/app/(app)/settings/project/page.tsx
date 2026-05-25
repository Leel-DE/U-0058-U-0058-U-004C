import {
  Activity,
  Boxes,
  CheckCircle2,
  Clock,
  Database,
  FileJson,
  GitCommitHorizontal,
  HardDrive,
  Server,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import { getProjectInfo } from '@/server/system/project-info';
import type { HealthStatus } from '@/server/system/health';

export const dynamic = 'force-dynamic';

function statusVariant(status: HealthStatus) {
  if (status === 'ok') return 'success';
  if (status === 'degraded') return 'warning';
  return 'destructive';
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number | null | undefined;
  icon: typeof Activity;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value ?? 'n/a'}</p>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function ProjectSettingsPage() {
  const ctx = await getContext();
  const info = await getProjectInfo(ctx.orgId);
  const project = info.packageInfo.project;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Project status</h2>
          <p className="text-sm text-muted-foreground">
            Runtime, database, migration, storage, worker, and package state for this local project.
          </p>
        </div>
        <Badge variant={statusVariant(info.health.status)}>{info.health.status}</Badge>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Project" value={project.name} icon={Boxes} />
        <Stat label="Version" value={project.version} icon={GitCommitHorizontal} />
        <Stat label="Node" value={project.node} icon={Server} />
        <Stat label="Database size" value={info.dbInfo?.database_size} icon={Database} />
        <Stat label="Stores" value={`${info.orgCounts?.active_stores ?? 0}/${info.orgCounts?.stores ?? 0}`} icon={Activity} />
        <Stat label="Products" value={info.orgCounts?.active_competitor_products ?? 0} icon={Boxes} />
        <Stat label="Snapshots" value={info.orgCounts?.price_snapshots ?? 0} icon={Clock} />
        <Stat label="Debug artifacts" value={info.orgCounts?.extraction_artifacts ?? 0} icon={FileJson} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service health</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {info.health.checks.map((check) => (
            <div key={check.service} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium capitalize">{check.service}</div>
                <Badge variant={statusVariant(check.status)}>{check.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{check.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Latency: {check.latencyMs == null ? 'n/a' : `${check.latencyMs}ms`}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Runtime config</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock value={info.config} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stack versions</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock value={project} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Database integrity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Database</p>
                <p className="font-medium">{info.dbInfo?.database_name}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">PostgreSQL</p>
                <p className="font-medium">{info.dbInfo?.server_version}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Public tables</p>
                <p className="font-medium">{info.dbInfo?.public_tables}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">RLS tables</p>
                <p className="font-medium">{info.dbInfo?.rls_tables}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Policies</p>
                <p className="font-medium">{info.dbInfo?.policies}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Views / indexes</p>
                <p className="font-medium">{info.dbInfo?.views} / {info.dbInfo?.indexes}</p>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Latest schema verification</span>
              </div>
              <p className="mt-2 break-all font-mono text-xs">{info.schemaSnapshot?.snapshot_hash ?? 'No snapshot'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {info.schemaSnapshot?.created_at ? new Date(info.schemaSnapshot.created_at).toLocaleString() : 'Never'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organization data</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock value={info.orgCounts} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Raw SQL migrations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Path</th>
                <th className="px-4 py-2">Hash</th>
                <th className="px-4 py-2">Applied</th>
              </tr>
            </thead>
            <tbody>
              {info.migrations.map((migration) => (
                <tr key={migration.path} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{migration.path}</td>
                  <td className="max-w-72 truncate px-4 py-2 font-mono text-xs text-muted-foreground">
                    {migration.hash}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(migration.applied_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Largest tables
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Table</th>
                <th className="px-4 py-2">Estimated rows</th>
                <th className="px-4 py-2">Total size</th>
                <th className="px-4 py-2">Index size</th>
                <th className="px-4 py-2">Last analyze</th>
              </tr>
            </thead>
            <tbody>
              {info.tableStats.map((table) => (
                <tr key={table.table_name} className="border-t">
                  <td className="px-4 py-2 font-medium">{table.table_name}</td>
                  <td className="px-4 py-2">{table.estimated_rows}</td>
                  <td className="px-4 py-2">{table.total_size}</td>
                  <td className="px-4 py-2">{table.index_size}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {table.last_analyze ? new Date(table.last_analyze).toLocaleString() : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Generated at {new Date(info.generatedAt).toLocaleString()} from local runtime state. Secrets are intentionally omitted.
      </p>
    </div>
  );
}
