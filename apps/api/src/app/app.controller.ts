import type { GetHealthSuccessResponse } from '@steadystack/contracts/server';
import { getHealthHttpContract } from '@steadystack/contracts/runtime';
import { Controller, Get, UseInterceptors } from '@nestjs/common';

import { AppService } from './app.service';
import { HttpContractInterceptor } from './http-contract/http-contract.interceptor';
import { Public, SkipRateLimit } from './security/security.module';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @SkipRateLimit()
  @UseInterceptors(new HttpContractInterceptor(getHealthHttpContract))
  health(): GetHealthSuccessResponse {
    return this.appService.health();
  }
}
