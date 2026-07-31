import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@agentic-webapp/contracts';
import { AppService } from './app.service';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  health(): HealthResponse {
    return this.appService.health();
  }
}
