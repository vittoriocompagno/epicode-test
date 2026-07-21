import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/bulk')({
  component: BulkPage,
});

function BulkPage() {
  return (
    <section>
      <h1 className="font-heading text-2xl font-semibold">Bulk generation</h1>
      <p className="mt-2 text-muted-foreground">Not exposed in this API surface yet.</p>
    </section>
  );
}
