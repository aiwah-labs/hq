'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Field, Input, Label, Select, SubmitButton } from '@/components/ui';
import { createUserAction } from './actions';

// String literals only — never import @hq/db in client components (Prisma pulls in Node.js globals)
const ROLE_ADMIN = 'ADMIN';
const ROLE_MEMBER = 'MEMBER';
const ROLE_BOT = 'BOT';

interface Props {
  onSuccess?: () => void;
  isSuperadmin: boolean;
}

const initialState = { success: false, error: '' };

export function CreateUserForm({ onSuccess, isSuperadmin }: Props) {
  const [state, formAction] = useActionState(createUserAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success('User created successfully');
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="space-y-3">
      <Field>
        <Label htmlFor="create-name">Name</Label>
        <Input id="create-name" name="name" placeholder="Name" autoComplete="name" />
      </Field>
      <Field>
        <Label htmlFor="create-email">Email</Label>
        <Input id="create-email" name="email" type="email" required placeholder="Email" autoComplete="email" />
      </Field>
      <Field>
        <Label htmlFor="create-password">Password</Label>
        <Input id="create-password" name="password" type="password" required placeholder="Temporary password" />
      </Field>
      <Field>
        <Label htmlFor="create-role">Role</Label>
        <Select id="create-role" name="role" defaultValue={ROLE_MEMBER}>
          {isSuperadmin ? <option value={ROLE_ADMIN}>Admin</option> : null}
          <option value={ROLE_MEMBER}>Member</option>
          <option value={ROLE_BOT}>Bot</option>
        </Select>
      </Field>
      <SubmitButton size="sm">Create user</SubmitButton>
    </form>
  );
}
