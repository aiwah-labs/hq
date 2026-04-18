'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, Field, FieldHint, Input, Label } from '@/components/ui';
import { connectStaticAction, disconnectAction, startOAuthAction } from './actions';

interface FieldSpec {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  placeholder?: string;
  help?: string;
}

interface DefSummary {
  key: string;
  name: string;
  description: string;
  icon?: string;
  scope: 'org' | 'user';
  multiplicity: 'single' | 'multiple';
  authKind: 'static' | 'oauth';
  docsUrl?: string;
  fields: FieldSpec[];
}

interface ConnectionSummary {
  id: string;
  label: string;
  scope: 'org' | 'user';
  userId: string | null;
  status: string;
  lastUsedAt: string | null;
  allowedUserIds: string[];
  allowedRoles: string[];
  createdAt: string;
}

interface Props {
  def: DefSummary;
  connections: ConnectionSummary[];
}

export function IntegrationCard({ def, connections }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canAddMore = def.multiplicity === 'multiple' || connections.length === 0;

  return (
    <div
      className="rounded-[8px] border border-[var(--app-border)] bg-[var(--app-bg-elevated)] p-4"
      data-testid={`integration-${def.key}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {def.icon ? (
            <img
              src={def.icon}
              alt=""
              className="mt-0.5 h-8 w-8 rounded-[6px] border border-[var(--app-border)] bg-white object-contain p-1"
            />
          ) : (
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--app-border)] bg-[var(--app-input-bg)] font-mono text-[11px] uppercase text-[var(--app-muted)]">
              {def.key.slice(0, 2)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-medium text-[var(--app-fg)]">{def.name}</p>
              <Badge tone="teal">{def.scope}</Badge>
              <Badge tone="neutral">{def.authKind === 'oauth' ? 'OAuth' : 'API key'}</Badge>
            </div>
            <p className="mt-0.5 text-[12px] text-[var(--app-muted)]">{def.description}</p>
            {def.docsUrl ? (
              <a
                href={def.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] text-[var(--app-muted)] underline-offset-2 hover:underline"
              >
                Provider docs ↗
              </a>
            ) : null}
          </div>
        </div>
        {canAddMore ? (
          <Button
            variant={connections.length === 0 ? 'primary' : 'secondary'}
            size="xs"
            data-testid={`integration-${def.key}-connect`}
            onClick={() => {
              setError(null);
              setOpen((v) => !v);
            }}
            disabled={pending}
          >
            {open ? 'Cancel' : connections.length === 0 ? 'Connect' : 'Add another'}
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 rounded-[6px] border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
          {def.authKind === 'oauth' ? (
            <OAuthConnectForm
              integrationKey={def.key}
              onError={setError}
              onStart={() => setError(null)}
            />
          ) : (
            <StaticConnectForm
              integrationKey={def.key}
              fields={def.fields}
              onError={setError}
              onSuccess={() => setOpen(false)}
              pending={pending}
              startTransition={startTransition}
            />
          )}
          {error ? (
            <p className="mt-2 text-[12px] text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {connections.length > 0 ? (
        <ul className="mt-3 space-y-2" data-testid={`integration-${def.key}-connections`}>
          {connections.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-[6px] border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--app-fg)]">{c.label}</span>
                  <Badge tone={c.status === 'ACTIVE' ? 'success' : 'danger'}>{c.status}</Badge>
                </div>
                <p className="text-[11px] text-[var(--app-muted)]">
                  {c.lastUsedAt ? `Last used ${new Date(c.lastUsedAt).toLocaleString()}` : 'Not yet used'}
                  {c.allowedUserIds.length + c.allowedRoles.length > 0
                    ? ` · ACL (${c.allowedUserIds.length + c.allowedRoles.length})`
                    : ''}
                </p>
              </div>
              <form
                action={async () => {
                  await disconnectAction(c.id);
                }}
              >
                <Button
                  type="submit"
                  variant="subtle"
                  size="xs"
                  data-testid={`connection-${c.id}-disconnect`}
                >
                  Disconnect
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StaticConnectForm({
  integrationKey,
  fields,
  onError,
  onSuccess,
  pending,
  startTransition,
}: {
  integrationKey: string;
  fields: FieldSpec[];
  onError: (msg: string) => void;
  onSuccess: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [label, setLabel] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const credentials: Record<string, unknown> = {};
        for (const f of fields) {
          const val = values[f.name] ?? '';
          if (f.required && !val) {
            onError(`${f.label} is required.`);
            return;
          }
          if (val) credentials[f.name] = val;
        }
        startTransition(async () => {
          try {
            await connectStaticAction({
              integrationKey,
              label: label || integrationKey,
              credentials,
            });
            onSuccess();
          } catch (err) {
            onError(err instanceof Error ? err.message : String(err));
          }
        });
      }}
    >
      <Field>
        <Label htmlFor="integration-label">Label</Label>
        <Input
          id="integration-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`My ${integrationKey}`}
          required
        />
        <FieldHint>A name for this connection, e.g. Main store</FieldHint>
      </Field>
      {fields.map((f) => (
        <Field key={f.name}>
          <Label htmlFor={`field-${f.name}`}>{f.label}</Label>
          <Input
            id={`field-${f.name}`}
            type={f.type === 'password' ? 'password' : f.type === 'url' ? 'url' : 'text'}
            value={values[f.name] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
            placeholder={f.placeholder}
            required={f.required}
          />
          {f.help ? <FieldHint>{f.help}</FieldHint> : null}
        </Field>
      ))}
      <div className="pt-1">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Connecting…' : 'Connect'}
        </Button>
      </div>
    </form>
  );
}

function OAuthConnectForm({
  integrationKey,
  onError,
  onStart,
}: {
  integrationKey: string;
  onError: (msg: string) => void;
  onStart: () => void;
}) {
  const [label, setLabel] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onStart();
        startTransition(async () => {
          try {
            const redirectUri = `${window.location.origin}/settings/integrations/oauth/callback`;
            const { authorizeUrl } = await startOAuthAction({
              integrationKey,
              redirectUri,
              label: label || undefined,
            });
            window.location.href = authorizeUrl;
          } catch (err) {
            onError(err instanceof Error ? err.message : String(err));
          }
        });
      }}
    >
      <Field>
        <Label htmlFor="oauth-label">Label</Label>
        <Input
          id="oauth-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`My ${integrationKey}`}
        />
        <FieldHint>Shown in the connection list once authorized.</FieldHint>
      </Field>
      <div className="pt-1">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Redirecting…' : `Authorize with ${integrationKey}`}
        </Button>
      </div>
    </form>
  );
}
