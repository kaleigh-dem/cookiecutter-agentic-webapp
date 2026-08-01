import 'reflect-metadata';
import { startNodeTelemetry } from '@agentic-webapp/observability/telemetry';

async function bootstrap() {
  const telemetry = await startNodeTelemetry({ serviceName: 'api' });
  const [{ NestFactory }, { AppModule }] = await Promise.all([
    import('@nestjs/core'),
    import('./app/app.module.js'),
  ]);
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
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
