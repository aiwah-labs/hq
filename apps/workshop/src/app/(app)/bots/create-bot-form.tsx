'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Field, Input, Label, SubmitButton } from '@/components/ui';
import { createBotAction } from './actions';

interface Props {
  onSuccess?: () => void;
}

const initialState = {
  success: false,
  error: '',
};

export function CreateBotForm({ onSuccess }: Props) {
  const [state, formAction] = useActionState(createBotAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success('Bot created successfully');
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="space-y-3">
      <Field>
        <Label htmlFor="bot-name">Name</Label>
        <Input id="bot-name" name="name" required placeholder="Trend monitor" />
      </Field>
      <Field>
        <Label htmlFor="bot-description">Description</Label>
        <Input id="bot-description" name="description" placeholder="Tracks topic movement and summary signals" />
      </Field>
      <SubmitButton size="sm">Create bot</SubmitButton>
    </form>
  );
}
