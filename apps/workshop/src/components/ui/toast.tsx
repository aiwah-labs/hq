import { Badge } from './badge';
import { Card, CardBody } from './card';

interface ToastProps {
  title: string;
  message?: string;
  tone?: 'neutral' | 'success' | 'danger';
}

export function Toast({ title, message, tone = 'neutral' }: ToastProps) {
  const badgeTone = tone === 'success' ? 'success' : tone === 'danger' ? 'danger' : 'blue';

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2">
          <Badge tone={badgeTone}>{tone}</Badge>
          <p className="text-[13px] font-semibold text-[var(--app-fg)]">{title}</p>
        </div>
        {message ? <p className="mt-2 text-[13px] text-[var(--app-muted)]">{message}</p> : null}
      </CardBody>
    </Card>
  );
}
