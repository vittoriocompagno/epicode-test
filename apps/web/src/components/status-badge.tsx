import type { BatchStatusResponse, DocumentStatus } from '@certificates/contracts';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type BatchStatus = BatchStatusResponse['status'];
type StatusKind = DocumentStatus | BatchStatus;

const statusStyles: Record<StatusKind, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  queued: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  processing: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100',
  completed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  failed: 'bg-destructive/10 text-destructive',
};

type StatusBadgeProps = {
  status: StatusKind;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn('capitalize', statusStyles[status], className)}>
      {status}
    </Badge>
  );
}
