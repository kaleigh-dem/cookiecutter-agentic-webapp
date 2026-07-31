import {
  MetricsRegistry,
  checkDependencies,
  createCorrelationContext,
  createStructuredLogger,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  AgentTasksModule,
  ApiDatabaseConnection,
} from '../agent-tasks/agent-tasks.module';

const logger = createStructuredLogger('api');
const metrics = new MetricsRegistry();

interface ApiRequest extends IncomingMessage {
  originalUrl?: string;
}

@Injectable()
class RequestContextMiddleware {
  public use(
    request: ApiRequest,
    response: ServerResponse,
    next: () => void,
  ): void {
    const startedAt = performance.now();
    const requestId = request.headers['x-request-id'];
    const correlationId = request.headers['x-correlation-id'];
    const traceParent = request.headers.traceparent;
    const userId = request.headers['x-actor-id'];
    const traceId =
      typeof traceParent === 'string' ? traceParent.split('-')[1] : undefined;
    const context = createCorrelationContext({
      ...(typeof requestId === 'string' ? { requestId } : {}),
      ...(typeof correlationId === 'string' ? { correlationId } : {}),
      ...(typeof traceId === 'string' ? { traceId } : {}),
      ...(typeof userId === 'string' ? { userId } : {}),
    });

    response.setHeader('x-request-id', context.requestId);
    response.setHeader('x-trace-id', context.traceId);

    runWithCorrelationContext(context, () => {
      logger.info('http.request.started', {
        method: request.method,
        path: request.originalUrl ?? request.url,
      });

      response.once('finish', () => {
        const durationMs = performance.now() - startedAt;
        metrics.increment('http_requests_total');
        metrics.observe('http_request_duration_ms', durationMs);
        logger.info('http.request.completed', {
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode: response.statusCode,
          durationMs,
        });
      });

      next();
    });
  }
}

@Controller()
class OperationsController {
  public constructor(private readonly connection: ApiDatabaseConnection) {}

  @Get('health/live')
  public live() {
    return { status: 'ok', service: 'api' } as const;
  }

  @Get('health/ready')
  public async ready() {
    const report = await checkDependencies([
      {
        name: 'database',
        check: async () => {
          await this.connection.value.pool.query('select 1');
        },
      },
    ]);

    if (report.status !== 'ok') {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return report;
  }

  @Get('metrics')
  public snapshot() {
    return metrics.snapshot();
  }
}

@Module({
  imports: [AgentTasksModule],
  controllers: [OperationsController],
  providers: [RequestContextMiddleware],
})
export class ObservabilityModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
