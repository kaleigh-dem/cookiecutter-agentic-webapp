import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@agentic-webapp/contracts';

@Injectable()
export class AppService {
  health(): HealthResponse {
    return {
      service: 'api',
      status: 'ok',
    };
  }
}
