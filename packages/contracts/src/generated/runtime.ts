/* This file is generated. Run `pnpm contracts:generate` instead of editing it. */

import { z } from 'zod';

export const AgentTaskResponseSchema = z.strictObject({
  correlationId: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
  prompt: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  title: z.string(),
});

export const CreateAgentTaskRequestSchema = z.strictObject({
  prompt: z.string().min(1).max(4000),
  title: z.string().min(1).max(120),
});

export const ErrorResponseSchema = z.strictObject({
  code: z.string(),
  fields: z
    .array(
      z.strictObject({
        code: z.string(),
        location: z.enum(['body', 'headers', 'path', 'query']),
        message: z.string(),
        path: z.string(),
      }),
    )
    .optional(),
  message: z.string(),
  requestId: z.string().optional(),
  statusCode: z.number().int().optional(),
});

export const HealthResponseSchema = z.strictObject({
  service: z.literal('api'),
  status: z.literal('ok'),
});

export const createAgentTaskHttpContract = {
  request: {
    body: CreateAgentTaskRequestSchema,
    headers: z.looseObject({
      'x-actor-id': z.string().min(1).optional(),
      'x-correlation-id': z.string().min(1).optional(),
    }),
    path: z.strictObject({}),
    query: z.strictObject({}),
  },
  responses: { '201': AgentTaskResponseSchema, '400': ErrorResponseSchema },
} as const;

export const getAgentTaskHttpContract = {
  request: {
    body: z.undefined(),
    headers: z.looseObject({
      'x-actor-id': z.string().min(1).optional(),
      'x-correlation-id': z.string().min(1).optional(),
    }),
    path: z.strictObject({ taskId: z.string().uuid() }),
    query: z.strictObject({}),
  },
  responses: {
    '200': AgentTaskResponseSchema,
    '403': ErrorResponseSchema,
    '404': ErrorResponseSchema,
  },
} as const;

export const getHealthHttpContract = {
  request: {
    body: z.undefined(),
    headers: z.looseObject({}),
    path: z.strictObject({}),
    query: z.strictObject({}),
  },
  responses: { '200': HealthResponseSchema },
} as const;
