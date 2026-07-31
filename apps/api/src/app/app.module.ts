import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [ObservabilityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
