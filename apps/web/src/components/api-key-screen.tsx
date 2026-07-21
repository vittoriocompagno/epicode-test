import { useState } from 'react';
import { KeyRoundIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiKey } from '@/hooks/use-api-key';
import { setApiKey, setVerifying } from '@/lib/auth';
import { ApiClientError, api } from '@/lib/api';

export function ApiKeyScreen() {
  const { authState } = useApiKey();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = authState === 'verifying';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter an API key to continue.');
      return;
    }

    setError(null);
    setVerifying(true);

    try {
      await api.verifyApiKey(trimmed);
      setApiKey(trimmed);
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Unable to verify API key.';
      setError(message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRoundIcon className="size-5" />
          </div>
          <CardTitle className="font-heading text-xl">Certificate console access</CardTitle>
          <CardDescription>
            Local challenge interface for managing templates, documents, and bulk generation against
            the HTTP API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTitle>Development API key</AlertTitle>
            <AlertDescription>
              The repository README and <code className="text-xs">.env.example</code> use{' '}
              <code className="text-xs">development-api-key</code>. Keys are stored in this browser
              session only.
            </AlertDescription>
          </Alert>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="api-key">API key</Label>
              <Input
                id="api-key"
                type="password"
                autoComplete="off"
                placeholder="Enter your API key"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Verifying…' : 'Connect'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
