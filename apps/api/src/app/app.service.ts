import type { GetHealthSuccessResponse } from '@agentic-webapp/contracts/server';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health(): GetHealthSuccessResponse {
    return {
      service: 'api',
      status: 'ok',
    };
  }
}
