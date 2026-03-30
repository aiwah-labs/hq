import { UserRole, UserStatus } from '@hq/db';
import { createServiceContext, listUsers } from '@hq/services';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,

  Field,
  Input,
  Label,
  Select,
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
  SubmitButton,
} from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { setUserStatusAction, updateUserRoleAction } from './actions';
import { CreateUserModal } from './create-user-modal';

interface Props {
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
}

function toLabel(value: string): string {
  const normalized = value.toLowerCase().replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export default async function UsersPage({ searchParams }: Props) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.users);
  const context = createServiceContext(principal);
  const users = await listUsers(context);
  const { success, error } = await searchParams;

  return (
    <main className="space-y-4">
      {success ? <Alert tone="success">{success}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* Page header with toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[18px] font-semibold leading-tight tracking-tight @sm:text-[22px]">Users</h1>
          <p className="mt-0.5 text-[13px] text-muted">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <CreateUserModal isSuperadmin={principal.isSuperadmin} />
      </div>

      {/* Users table */}
      <Card>
        <CardBody className="p-0">
          <TableWrap>
            <Table>
              <THead>
                <TR className="border-b-0">
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((user) => {
                  const targetRole = user.role;
                  const adminCannotEdit = !principal.isSuperadmin && (targetRole === UserRole.ADMIN || user.isSuperadmin);
                  const isSelf = principal.userId === user.id;

                  return (
                    <TR key={user.id}>
                      <TD>
                        <div>
                          <span className="font-medium">{user.email}</span>
                          {user.isSuperadmin ? (
                            <span className="ml-1.5 text-[11px] text-[var(--app-muted)]">SA</span>
                          ) : null}
                        </div>
                      </TD>
                      <TD>
                        <Badge tone="teal">{toLabel(user.role)}</Badge>
                      </TD>
                      <TD>
                        <Badge tone={user.status === UserStatus.ACTIVE ? 'success' : 'danger'}>{toLabel(user.status)}</Badge>
                      </TD>
                      <TD>
                        <div className="flex flex-col gap-1.5 @sm:flex-row @sm:items-center @sm:gap-2">
                          <form action={updateUserRoleAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="userId" value={user.id} />
                            <Select
                              name="role"
                              defaultValue={user.role}
                              size="sm"
                              className="min-w-[90px]"
                              disabled={adminCannotEdit || user.isSuperadmin}
                            >
                              {principal.isSuperadmin ? <option value={UserRole.ADMIN}>Admin</option> : null}
                              <option value={UserRole.MEMBER}>Member</option>
                              <option value={UserRole.BOT}>Bot</option>
                            </Select>
                            <SubmitButton
                              size="xs"
                              variant="secondary"
                              disabled={adminCannotEdit || user.isSuperadmin}
                            >
                              Save
                            </SubmitButton>
                          </form>
                          <form action={setUserStatusAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={user.status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE}
                            />
                            <SubmitButton
                              size="xs"
                              variant="subtle"
                              disabled={adminCannotEdit || user.isSuperadmin || (isSelf && user.status === UserStatus.ACTIVE)}
                            >
                              {user.status === UserStatus.ACTIVE ? 'Deactivate' : 'Activate'}
                            </SubmitButton>
                          </form>
                        </div>
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
