import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
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

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Certificates</p>
          <h1 className="mt-1 font-heading text-xl font-semibold">Operations console</h1>
        </div>
        <nav className="flex flex-wrap gap-2">
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
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
