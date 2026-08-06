import {
  checkDependencies,
  type DependencyProbe,
} from '@steadystack/observability';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface WorkerMetricsSnapshot {
  snapshot(): Record<string, unknown>;
}

export interface WorkerOperationsServerOptions {
  readonly host?: string;
  readonly port: number;
  readonly isAcceptingWork: () => boolean;
  readonly dependencies: readonly DependencyProbe[];
  readonly metrics: WorkerMetricsSnapshot;
}

export interface WorkerOperationsServerHandle {
  readonly port: number;
  close(): Promise<void>;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(value));
}

async function handleRequest(
  path: string,
  response: ServerResponse,
  options: WorkerOperationsServerOptions,
): Promise<void> {
  if (path === '/health/live') {
    writeJson(response, 200, { status: 'ok', service: 'worker' });
    return;
  }

  if (path === '/health/ready') {
    const report = await checkDependencies([
      {
        name: 'lifecycle',
        check: async () => {
          if (!options.isAcceptingWork()) {
            throw new Error('The worker is draining and not accepting work.');
          }
        },
      },
      ...options.dependencies,
    ]);
    writeJson(response, report.status === 'ok' ? 200 : 503, report);
    return;
  }

  if (path === '/metrics') {
    writeJson(response, 200, options.metrics.snapshot());
    return;
  }

  writeJson(response, 404, { status: 'not-found' });
}

export function startWorkerOperationsServer(
  options: WorkerOperationsServerOptions,
): Promise<WorkerOperationsServerHandle> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://worker.local').pathname;
    void handleRequest(path, response, options).catch(() => {
      if (!response.headersSent) {
        writeJson(response, 500, { status: 'error' });
      } else {
        response.destroy();
      }
    });
  });

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address() as AddressInfo | null;
      if (!address) {
        server.close();
        reject(
          new Error('The worker operations server did not expose an address.'),
        );
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) closeReject(error);
              else closeResolve();
            });
          }),
      });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(options.port, options.host ?? '0.0.0.0');
  });
}
