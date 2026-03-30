'use client';

import type { ThemePreference } from '@/lib/theme';
import { SubmitButton } from '@/components/ui';

interface Props {
  current: ThemePreference;
  action: (formData: FormData) => void;
}

const OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

export function AppearanceToggle({ current, action }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {OPTIONS.map((option) => {
        const selected = current === option;

        return (
          <form key={option} action={action}>
            <input type="hidden" name="theme" value={option} />
            <SubmitButton
              size="sm"
              variant={selected ? 'primary' : 'secondary'}
              className="w-full justify-center capitalize"
            >
              {option}
            </SubmitButton>
          </form>
        );
      })}
    </div>
  );
}
