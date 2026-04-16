'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui';
import { CreateBotForm } from './create-bot-form';

export function CreateBotModal() {
  const [open, setOpen] = useState(false);

  return (
    <Modal trigger="New Bot" title="Create bot" open={open} onOpenChange={setOpen}>
      <CreateBotForm onSuccess={() => setOpen(false)} />
    </Modal>
  );
}
