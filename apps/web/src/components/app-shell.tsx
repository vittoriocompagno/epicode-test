import { Link, useRouterState } from '@tanstack/react-router';
import { KeyRoundIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useApiKey } from '@/hooks/use-api-key';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/templates', label: 'Templates' },
  { to: '/documents', label: 'Documents' },
  { to: '/bulk', label: 'Bulk generation' },
] as const;

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { clearApiKey } = useApiKey();

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Certificates</p>
          <h1 className="mt-1 font-heading text-xl font-semibold">Operations console</h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <nav className="flex flex-wrap gap-2" aria-label="Main navigation">
            {navItems.map((item) => {
              const active = pathname === item.to;
              return (
                <Button
                  key={item.to}
                  asChild
                  variant={active ? 'default' : 'secondary'}
                  size="sm"
                  className={cn(!active && 'text-muted-foreground')}
                >
                  <Link to={item.to}>{item.label}</Link>
                </Button>
              );
            })}
          </nav>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearApiKey}
            className="shrink-0"
          >
            <KeyRoundIcon className="size-3.5" />
            Replace API key
          </Button>
        </div>
      </header>
      <main className="flex-1 pb-8">{children}</main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
