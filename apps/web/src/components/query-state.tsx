import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api';

type QueryStateProps = {
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  children: ReactNode;
};

export function QueryState({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  onRetry,
  children,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (isError) {
    const message =
      error instanceof ApiClientError ? error.message : 'Something went wrong while loading data.';
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span>{message}</span>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-10 text-center">
        <p className="font-medium">{emptyTitle}</p>
        {emptyDescription ? (
          <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
