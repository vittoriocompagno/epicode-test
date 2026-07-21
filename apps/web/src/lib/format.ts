export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatShortId(value: string): string {
  return value.slice(0, 8);
}

export function sanitizeErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return message.replace(/<[^>]*>/g, '').trim();
}
