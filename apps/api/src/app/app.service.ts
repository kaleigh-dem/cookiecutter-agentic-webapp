import type { GetHealthSuccessResponse } from '@steadystack/contracts/server';
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
