import Link from 'next/link';
import { listUsers, summarizeUserAuth } from '@hq/services';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  Select,
  SubmitButton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableWrap,
} from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { setUserStatusAction, updateUserRoleAction } from './actions';

interface Props {
  searchParams: Promise<{ success?: string; error?: string }>;
}

function toLabel(value: string): string {
  const normalized = value.toLowerCase().replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export default async function UsersPage({ searchParams }: Props) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.users);
  const users = await listUsers();
  const { success, error } = await searchParams;

  return (
    <main className="space-y-4">
      {success ? <Alert tone="success">{success}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[18px] font-semibold leading-tight tracking-tight">Users</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {users.length} user{users.length !== 1 ? 's' : ''} · Identity is authoritative in HQ — SSO maps into
            these records.
          </p>
        </div>
        <Link
          href="/users/new"
          className="inline-flex h-8 items-center rounded-[6px] border border-brand-teal bg-brand-teal px-3 text-[13px] font-medium text-white hover:bg-brand-teal-dark"
        >
          New user
        </Link>
      </div>

      <Card>
        <CardBody className="p-0">
          <TableWrap>
            <Table>
              <THead>
                <TR className="border-b-0">
                  <TH>Email</TH>
                  <TH>Name</TH>
                  <TH>Auth</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((user) => {
                  const auth = summarizeUserAuth(user);
                  const isSelf = principal.userId === user.id;
                  const external = auth.externalProviders[0];
                  return (
                    <TR key={user.id}>
                      <TD>
                        <div className="flex flex-col">
                          <span className="font-medium">{user.email}</span>
                          {external ? (
                            <span className="text-[11px] text-muted">
                              subject: {external.subject.slice(0, 18)}
                              {external.subject.length > 18 ? '…' : ''}
                            </span>
                          ) : null}
                        </div>
                      </TD>
                      <TD>{user.name ?? <span className="text-muted">—</span>}</TD>
                      <TD>
                        <Badge tone={external ? 'info' : auth.hasLocalPassword ? 'neutral' : 'warning'}>
                          {auth.primaryLabel}
                        </Badge>
                      </TD>
                      <TD>
                        <form action={updateUserRoleAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="userId" value={user.id} />
                          <Select name="role" defaultValue={user.role} size="sm" className="min-w-[90px]">
                            <option value="ADMIN">Admin</option>
                            <option value="MEMBER">Member</option>
                          </Select>
                          <SubmitButton size="xs" variant="secondary">
                            Save
                          </SubmitButton>
                        </form>
                      </TD>
                      <TD>
                        <Badge tone={user.status === 'ACTIVE' ? 'success' : 'danger'}>{toLabel(user.status)}</Badge>
                      </TD>
                      <TD className="text-right">
                        <form action={setUserStatusAction} className="inline">
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}
                          />
                          <SubmitButton
                            size="xs"
                            variant="subtle"
                            disabled={isSelf && user.status === 'ACTIVE'}
                          >
                            {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </SubmitButton>
                        </form>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        </CardBody>
      </Card>
    </main>
  );
}
