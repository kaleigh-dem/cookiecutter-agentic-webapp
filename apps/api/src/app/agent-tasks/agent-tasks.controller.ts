import {
  AgentTaskForbiddenError,
  AgentTaskNotFoundError,
  AgentTaskValidationError,
  CreateAgentTask,
  GetAgentTask,
  type AgentTask,
} from '@agentic-webapp/backend-agent-task';
import type {
  AgentTaskResponse,
  CreateAgentTaskRequest,
  CreateAgentTaskSuccessResponse,
  GetAgentTaskSuccessResponse,
} from '@agentic-webapp/contracts/server';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';

function toResponse(task: AgentTask): AgentTaskResponse {
  return {
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    status: task.status,
    correlationId: task.correlationId,
    createdAt: task.createdAt.toISOString(),
  };
}

function requireActor(actorId: string | undefined): string {
  if (!actorId?.trim()) {
    throw new BadRequestException({
      code: 'actor_required',
      message: 'x-actor-id is required.',
    });
  }
  return actorId.trim();
}

@Controller('agent-tasks')
export class AgentTasksController {
  public constructor(
    private readonly createAgentTask: CreateAgentTask,
    private readonly getAgentTask: GetAgentTask,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async create(
    @Body() body: CreateAgentTaskRequest,
    @Headers('x-actor-id') actorHeader?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<CreateAgentTaskSuccessResponse> {
    try {
      const normalizedCorrelationId = correlationId?.trim();
      const task = await this.createAgentTask.execute({
        actorId: requireActor(actorHeader),
        title: body.title,
        prompt: body.prompt,
        ...(normalizedCorrelationId
          ? { correlationId: normalizedCorrelationId }
          : {}),
      });
      return toResponse(task);
    } catch (error) {
      if (error instanceof AgentTaskValidationError) {
        throw new BadRequestException({
          code: 'validation_failed',
          message: error.message,
        });
      }
      throw error;
    }
  }

  @Get(':taskId')
  public async get(
    @Param('taskId') taskId: string,
    @Headers('x-actor-id') actorHeader?: string,
  ): Promise<GetAgentTaskSuccessResponse> {
    try {
      return toResponse(
        await this.getAgentTask.execute(taskId, requireActor(actorHeader)),
      );
    } catch (error) {
      if (error instanceof AgentTaskNotFoundError) {
        throw new NotFoundException({
          code: 'not_found',
          message: error.message,
        });
      }
      if (error instanceof AgentTaskForbiddenError) {
        throw new ForbiddenException({
          code: 'forbidden',
          message: error.message,
        });
      }
      throw error;
    }
  }
}
