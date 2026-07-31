import type { GetHealthSuccessResponse } from '@agentic-webapp/contracts/server';
import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  health(): GetHealthSuccessResponse {
    return this.appService.health();
  }
}
