import Link from 'next/link';
import { createServiceContext } from '@hq/services';
import { listIntegrations, listConnections } from '@hq/integrations';
import { Alert, Badge } from '@/components/ui';
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
    <div className="max-w-[880px] space-y-4">
      {success ? <Alert tone="success">{success}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <Link href="/settings" className="font-medium hover:text-[#0f1011] transition-colors">Settings</Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>Integrations</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Integrations</h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Connect third-party services so actions and agents can use them. Builders register
          integrations in code; admins manage credentials here.
        </p>
      </div>

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
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-[8px] border border-dashed border-[#e6e8eb] p-5"
      data-testid="integrations-empty"
    >
      <Badge tone="neutral">No integrations registered</Badge>
      <p className="text-[13px] text-[#0f1011]">
        This template ships provider-agnostic. Register integrations in code before they appear
        here.
      </p>
      <p className="text-[12px] text-[#62666d]">
        See <code className="font-mono text-[11px]">docs/integrations.md</code> for the pattern.
      </p>
    </div>
  );
}
