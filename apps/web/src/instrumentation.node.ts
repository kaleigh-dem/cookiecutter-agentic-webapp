import { startNodeTelemetry } from '@agentic-webapp/observability/telemetry';

export const webServerTelemetry = startNodeTelemetry({
  serviceName: 'web-server',
});
