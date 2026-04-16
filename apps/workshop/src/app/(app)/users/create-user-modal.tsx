'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui';
import { CreateUserForm } from './create-user-form';

interface Props {
  isSuperadmin: boolean;
}

export function CreateUserModal({ isSuperadmin }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Modal trigger="Add User" title="Create user" open={open} onOpenChange={setOpen}>
      <CreateUserForm onSuccess={() => setOpen(false)} isSuperadmin={isSuperadmin} />
    </Modal>
  );
}
