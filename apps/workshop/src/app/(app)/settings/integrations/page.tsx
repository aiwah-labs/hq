import Link from 'next/link';
import { createServiceContext } from '@hq/services';
import { listIntegrations, listConnections } from '@hq/integrations';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { IntegrationCard } from './IntegrationCard';

interface Props {
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function IntegrationsPage({ searchParams }: Props) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.integrations);
  const ctx = createServiceContext(principal);
  const defs = listIntegrations();
  const connections = await listConnections(ctx);
  const byKey = new Map<string, typeof connections>();
  for (const conn of connections) {
    const list = byKey.get(conn.integrationKey) ?? [];
    list.push(conn);
    byKey.set(conn.integrationKey, list);
  }

  const { success, error } = await searchParams;

  return (
    <main className="max-w-[880px] space-y-3">
      {success ? <Alert tone="success">{success}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardHeader className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[18px] font-semibold tracking-tight">Integrations</h1>
            <p className="mt-1 text-[13px] text-[var(--app-muted)]">
              Connect third-party services so actions and agents can use them. Builders register
              integrations in code; admins manage credentials here.
            </p>
          </div>
          <Link
            href="/settings"
            className="text-[12px] text-[var(--app-muted)] underline-offset-2 hover:underline"
          >
            Back to settings
          </Link>
        </CardHeader>
        <CardBody className="space-y-3 pt-1">
          {defs.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-3" data-testid="integrations-list">
              {defs.map((def) => (
                <li key={def.key}>
                  <IntegrationCard
                    def={{
                      key: def.key,
                      name: def.name,
                      description: def.description,
                      icon: def.icon,
                      scope: def.scope,
                      multiplicity: def.multiplicity,
                      authKind: def.auth.kind,
                      docsUrl: def.docsUrl,
                      fields:
                        def.auth.kind === 'static'
                          ? def.auth.fields.map((f) => ({
                              name: f.name,
                              label: f.label,
                              type: f.type,
                              required: f.required ?? false,
                              placeholder: f.placeholder,
                              help: f.help,
                            }))
                          : [],
                    }}
                    connections={(byKey.get(def.key) ?? []).map((c) => ({
                      id: c.id,
                      label: c.label,
                      scope: c.scope.toLowerCase() as 'org' | 'user',
                      userId: c.userId,
                      status: c.status,
                      lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
                      allowedUserIds: c.allowedUserIds,
                      allowedRoles: c.allowedRoles,
                      createdAt: c.createdAt.toISOString(),
                    }))}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </main>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-[8px] border border-dashed border-[var(--app-border)] p-5"
      data-testid="integrations-empty"
    >
      <Badge tone="neutral">No integrations registered</Badge>
      <p className="text-[13px] text-[var(--app-fg)]">
        This template ships provider-agnostic. Register integrations in code before they appear
        here.
      </p>
      <p className="text-[12px] text-[var(--app-muted)]">
        See <code className="font-mono text-[11px]">docs/integrations.md</code> for the pattern.
      </p>
    </div>
  );
}
