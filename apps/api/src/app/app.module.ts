import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ObservabilityModule } from './observability/observability.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [SecurityModule, ObservabilityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
