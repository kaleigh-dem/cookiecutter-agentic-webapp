import { Module } from '@nestjs/common';

import { AgentTasksModule } from './agent-tasks/agent-tasks.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [AgentTasksModule, ObservabilityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
