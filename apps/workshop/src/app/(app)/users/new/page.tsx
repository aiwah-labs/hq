import Link from 'next/link';
import { Alert, Card, CardBody, CardHeader, Field, Input, Label, Select, SubmitButton } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';
import { createUserAction } from '../actions';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewUserPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.usersManage);
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-lg space-y-4">
      <div>
        <Link href="/users" className="text-[12px] text-muted hover:underline">
          ← Back to users
        </Link>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Create user</h1>
        <p className="mt-0.5 text-[12.5px] text-[#62666d]">
          Bootstrap a local-password user. SSO users provision automatically on first sign-in.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b-0 pb-0">
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </CardHeader>
        <CardBody>
          <form action={createUserAction} className="space-y-3">
            <Field>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </Field>
            <Field>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" />
            </Field>
            <Field>
              <Label htmlFor="password">Temporary password</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </Field>
            <Field>
              <Label htmlFor="role">Role</Label>
              <Select id="role" name="role" defaultValue="MEMBER">
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </Select>
            </Field>
            <SubmitButton>Create user</SubmitButton>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
