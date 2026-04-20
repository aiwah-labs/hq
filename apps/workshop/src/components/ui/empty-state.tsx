import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// EmptyState — ui-design skill rules:
// - Inline message + one primary action. No illustration unless first-run onboarding.
// - Never a centered spinner. Never a full-page treatment inside a table/list boundary.
// - Icon is optional and small (16px). No large decorative illustrations on data pages.

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 px-6 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#f3f4f5] text-[#8a8f98]">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-[#0f1011]">{title}</p>
        {description && (
          <p className="text-[12px] text-[#62666d] max-w-[280px]">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// EmptyStateRow — for use inside a table, renders as a full-width row
export function EmptyStateRow({
  title,
  description,
  action,
  colSpan = 10,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn('py-12 text-center', className)}>
        <EmptyState title={title} description={description} action={action} />
      </td>
    </tr>
  );
}

// EmptyStateInline — for small panels/sections with no data
export function EmptyStateInline({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between px-4 py-3', className)}>
      <p className="text-[12px] text-[#8a8f98]">{title}</p>
      {action}
    </div>
  );
}
