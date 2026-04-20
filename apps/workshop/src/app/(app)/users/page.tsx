import Link from 'next/link';
import { listUsers, summarizeUserAuth } from '@hq/services';
import { Alert, Badge, StatusDot, Button, Card, CardBody, Select, SubmitButton, TBody, TD, TH, THead, TR, Table, TableWrap } from '@/components/ui';
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
    <div className="space-y-4">
      {success ? <Alert tone="success">{success}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
            <span className="font-medium">Home</span>
            <span className="text-[#d0d6e0]">/</span>
            <span>Users</span>
          </div>
          <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Users</h1>
          <p className="mt-2 text-[12.5px] text-[#62666d]">
            {users.length} user{users.length !== 1 ? 's' : ''} &mdash; identity is authoritative in HQ.
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <Link href="/users/new">
            <Button variant="primary" size="sm">New user</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardBody className="p-0">
          <TableWrap>
            <Table>
              <THead>
                <TR>
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
                    <TR key={user.id} className="hover:bg-[#fafbfb]">
                      <TD>
                        <div className="flex flex-col">
                          <span className="text-[12.5px] font-medium text-[#0f1011]">{user.email}</span>
                          {external ? (
                            <span className="text-[11px] text-[#8a8f98]">
                              {external.subject.slice(0, 18)}{external.subject.length > 18 ? '…' : ''}
                            </span>
                          ) : null}
                        </div>
                      </TD>
                      <TD className="text-[12px] text-[#62666d]">{user.name ?? '—'}</TD>
                      <TD>
                        <Badge tone={external ? 'indigo' : auth.hasLocalPassword ? 'neutral' : 'warn'}>
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
                          <SubmitButton size="xs" variant="secondary">Save</SubmitButton>
                        </form>
                      </TD>
                      <TD>
                        <StatusDot
                          tone={user.status === 'ACTIVE' ? 'success' : 'neutral'}
                          label={toLabel(user.status)}
                        />
                      </TD>
                      <TD className="text-right">
                        <form action={setUserStatusAction} className="inline">
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="status" value={user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'} />
                          <SubmitButton size="xs" variant="subtle" disabled={isSelf && user.status === 'ACTIVE'}>
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
    </div>
  );
}
