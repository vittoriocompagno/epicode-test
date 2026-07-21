import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/templates')({
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <section>
      <h1 className="font-heading text-2xl font-semibold">Templates</h1>
      <p className="mt-2 text-muted-foreground">Managed through the HTTP API.</p>
    </section>
  );
}
