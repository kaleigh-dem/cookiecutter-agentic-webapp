import 'reflect-metadata';
import { startNodeTelemetry } from '@agentic-webapp/observability/telemetry';
import { parseTrustedProxyHops } from './app/security/rate-limit-provider.js';

async function bootstrap() {
  const telemetry = await startNodeTelemetry({ serviceName: 'api' });
  const [{ NestFactory }, { AppModule }] = await Promise.all([
    import('@nestjs/core'),
    import('./app/app.module.js'),
  ]);
  const app = await NestFactory.create(AppModule);
  const expressApplication = app.getHttpAdapter().getInstance() as {
    disable?: (setting: string) => void;
    set?: (setting: string, value: unknown) => void;
  };
  expressApplication.disable?.('x-powered-by');
  expressApplication.set?.('trust proxy', parseTrustedProxyHops(process.env));
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: [
      'authorization',
      'content-type',
      'traceparent',
      'x-correlation-id',
      'x-request-id',
    ],
    exposedHeaders: ['x-request-id', 'x-trace-id'],
    credentials: false,
    maxAge: 600,
  });
  app.setGlobalPrefix('api');

  const shutdown = async () => {
    await app.close();
    await telemetry.shutdown();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
