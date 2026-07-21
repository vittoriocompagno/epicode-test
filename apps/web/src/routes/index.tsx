import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <section className="space-y-3">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Certificate Generator</h1>
      <p className="max-w-2xl text-muted-foreground">
        Operator console scaffold. Use the HTTP API for templates, documents, and previews.
      </p>
    </section>
  );
}
