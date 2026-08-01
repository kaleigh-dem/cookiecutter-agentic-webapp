'use client';

import { createApiClient } from '@agentic-webapp/contracts/client';
import { useEffect, useMemo, useState } from 'react';

interface HealthState {
  readonly message: string;
  readonly status: 'checking' | 'error' | 'ok';
}

export function ApiHealth() {
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl:
          process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000',
      }),
    [],
  );
  const [health, setHealth] = useState<HealthState>({
    message: 'Checking the generated API client connection…',
    status: 'checking',
  });

  useEffect(() => {
    const controller = new AbortController();

    void client
      .getHealth({ signal: controller.signal })
      .then((response) => {
        setHealth({
          message: `${response.service} reports ${response.status}`,
          status: 'ok',
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setHealth({
            message:
              error instanceof Error
                ? error.message
                : 'The API health request failed.',
            status: 'error',
          });
        }
      });

    return () => controller.abort();
  }, [client]);

  return (
    <section aria-live="polite" aria-label="API contract status">
      <h2>Generated API client</h2>
      <p data-status={health.status}>{health.message}</p>
    </section>
  );
}
