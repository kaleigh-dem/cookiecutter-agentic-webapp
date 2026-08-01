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
  createCorrelationContext,
  getCorrelationContext,
} from '@agentic-webapp/observability';
import { getActiveTraceParent } from '@agentic-webapp/observability/telemetry';
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
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  type AuthenticatedPrincipal,
  CurrentPrincipal,
  RequirePermissions,
  SecurityAuditService,
} from '../security/security.module';

const taskIdPipe = new ParseUUIDPipe();

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

async function requireTaskId(taskId: string): Promise<string> {
  return taskIdPipe.transform(taskId, {
    type: 'param',
    data: 'taskId',
  });
}

@Controller('agent-tasks')
export class AgentTasksController {
  public constructor(
    private readonly createAgentTask: CreateAgentTask,
    private readonly getAgentTask: GetAgentTask,
    private readonly audit: SecurityAuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('agent-tasks:write')
  public async create(
    @Body() body: CreateAgentTaskRequest,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<CreateAgentTaskSuccessResponse> {
    try {
      const actorId = principal.subject;
      const normalizedCorrelationId = correlationId?.trim();
      const context =
        getCorrelationContext() ??
        createCorrelationContext({
          userId: actorId,
          ...(normalizedCorrelationId
            ? { correlationId: normalizedCorrelationId }
            : {}),
        });
      const traceParent = getActiveTraceParent();
      const task = await this.createAgentTask.execute({
        actorId,
        userId: context.userId ?? actorId,
        requestId: context.requestId,
        traceId: context.traceId,
        ...(traceParent ? { traceParent } : {}),
        title: body.title,
        prompt: body.prompt,
        ...(normalizedCorrelationId
          ? { correlationId: normalizedCorrelationId }
          : context.correlationId
            ? { correlationId: context.correlationId }
            : {}),
      });
      this.audit.record({
        action: 'agent-task.create',
        actorId,
        outcome: 'allowed',
        resourceType: 'agent-task',
        resourceId: task.id,
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
  @RequirePermissions('agent-tasks:read')
  public async get(
    @Param('taskId') rawTaskId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<GetAgentTaskSuccessResponse> {
    const taskId = await requireTaskId(rawTaskId);

    try {
      const task = await this.getAgentTask.execute(taskId, principal.subject);
      this.audit.record({
        action: 'agent-task.read',
        actorId: principal.subject,
        outcome: 'allowed',
        resourceType: 'agent-task',
        resourceId: task.id,
      });
      return toResponse(task);
    } catch (error) {
      if (error instanceof AgentTaskNotFoundError) {
        throw new NotFoundException({
          code: 'not_found',
          message: error.message,
        });
      }
      if (error instanceof AgentTaskForbiddenError) {
        this.audit.record({
          action: 'agent-task.read',
          actorId: principal.subject,
          outcome: 'denied',
          resourceType: 'agent-task',
          resourceId: taskId,
          reason: 'not_owner',
        });
        throw new ForbiddenException({
          code: 'forbidden',
          message: error.message,
        });
      }
      throw error;
    }
  }
}
