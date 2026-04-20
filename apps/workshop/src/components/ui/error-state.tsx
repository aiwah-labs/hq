import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// ErrorState — ui-design skill rules:
// - Inline #dc2626 text + retry. Never a toast as the only signal.
// - Don't blow up the full page layout — render in-boundary.
// - Keep it terse: what failed + one retry action.

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 px-6 text-center',
        className,
      )}
      role="alert"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-50">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-[#dc2626]"
          aria-hidden="true"
        >
          <path
            d="M7 1.75a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 7 1.75ZM7 4.5v3M7 9.5h.007"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-[#dc2626]">{title}</p>
        {message && (
          <p className="text-[12px] text-[#62666d] max-w-[280px]">{message}</p>
        )}
      </div>
      {(onRetry || action) && (
        <div className="mt-1">
          {action ?? (
            <button
              onClick={onRetry}
              className="h-7 px-2.5 inline-flex items-center justify-center rounded-md border border-[#e6e8eb] bg-white text-[12px] font-medium text-[#3d4149] hover:bg-[#fafbfb] hover:border-[#d0d6e0] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009E85]/40 focus-visible:ring-offset-1"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ErrorStateRow — inline inside a table
export function ErrorStateRow({
  title,
  message,
  onRetry,
  colSpan = 10,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  colSpan?: number;
  className?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn('py-8 text-center', className)}>
        <ErrorState title={title} message={message} onRetry={onRetry} />
      </td>
    </tr>
  );
}

// ErrorBanner — inline at the top of a panel for a failed mutation
export function ErrorBanner({
  message,
  onDismiss,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2',
        className,
      )}
      role="alert"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 14 14"
        fill="none"
        className="shrink-0 text-[#dc2626]"
        aria-hidden="true"
      >
        <path
          d="M7 1.75a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 7 1.75ZM7 4.5v3M7 9.5h.007"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="flex-1 text-[12px] text-[#dc2626]">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-[#dc2626]/60 hover:text-[#dc2626] transition-colors"
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
