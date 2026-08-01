import type { GetHealthSuccessResponse } from '@agentic-webapp/contracts/server';
import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import { Public, SkipRateLimit } from './security/security.module';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @SkipRateLimit()
  health(): GetHealthSuccessResponse {
    return this.appService.health();
  }
}
