import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/documents')({
  component: DocumentsPage,
});

function DocumentsPage() {
  return (
    <section>
      <h1 className="font-heading text-2xl font-semibold">Documents</h1>
      <p className="mt-2 text-muted-foreground">
        Document listing and generation status will be implemented later.
      </p>
    </section>
  );
}
