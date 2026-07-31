import {
  AGENT_TASK_REPOSITORY,
  CreateAgentTask,
  GetAgentTask,
  type AgentTaskRepository,
} from '@agentic-webapp/backend-agent-task';
import {
  createDatabase,
  DrizzleAgentTaskRepository,
  type DatabaseConnection,
} from '@agentic-webapp/database';
import { Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';

import { AgentTasksController } from './agent-tasks.controller';

@Injectable()
class ApiDatabaseConnection implements OnModuleDestroy {
  public readonly value: DatabaseConnection = createDatabase({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/agentic_webapp',
    applicationName: 'agentic-webapp-api',
  });

  public async onModuleDestroy(): Promise<void> {
    await this.value.close();
  }
}

@Injectable()
class RepositoryProvider {
  public readonly value: AgentTaskRepository;

  public constructor(connection: ApiDatabaseConnection) {
    this.value = new DrizzleAgentTaskRepository(connection.value.database);
  }
}

@Injectable()
class CreateAgentTaskProvider extends CreateAgentTask {
  public constructor(
    @Inject(AGENT_TASK_REPOSITORY) repository: AgentTaskRepository,
  ) {
    super(repository);
  }
}

@Injectable()
class GetAgentTaskProvider extends GetAgentTask {
  public constructor(
    @Inject(AGENT_TASK_REPOSITORY) repository: AgentTaskRepository,
  ) {
    super(repository);
  }
}

@Module({
  controllers: [AgentTasksController],
  providers: [
    ApiDatabaseConnection,
    RepositoryProvider,
    {
      provide: AGENT_TASK_REPOSITORY,
      inject: [RepositoryProvider],
      useFactory: (provider: RepositoryProvider) => provider.value,
    },
    { provide: CreateAgentTask, useClass: CreateAgentTaskProvider },
    { provide: GetAgentTask, useClass: GetAgentTaskProvider },
  ],
})
export class AgentTasksModule {}
