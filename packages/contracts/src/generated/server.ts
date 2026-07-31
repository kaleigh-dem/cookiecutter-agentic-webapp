/* This file is generated. Run `pnpm contracts:generate` instead of editing it. */

import type { components, operations } from './openapi';

type JsonResponseBody<T> = T extends {
  content: { 'application/json': infer Body };
}
  ? Body
  : never;

export type SuccessResponse<T> = T extends { responses: infer Responses }
  ? Responses extends { 200: infer Response }
    ? JsonResponseBody<Response>
    : Responses extends { 201: infer Response }
      ? JsonResponseBody<Response>
      : Responses extends { 202: infer Response }
        ? JsonResponseBody<Response>
        : Responses extends { 203: infer Response }
          ? JsonResponseBody<Response>
          : Responses extends { 204: infer Response }
            ? JsonResponseBody<Response>
            : never
  : never;

export type AgentTaskResponse = components['schemas']['AgentTaskResponse'];
export type CreateAgentTaskRequest =
  components['schemas']['CreateAgentTaskRequest'];
export type ErrorResponse = components['schemas']['ErrorResponse'];
export type HealthResponse = components['schemas']['HealthResponse'];

export type CreateAgentTaskOperation = operations['createAgentTask'];
export type CreateAgentTaskSuccessResponse =
  SuccessResponse<CreateAgentTaskOperation>;

export type GetAgentTaskOperation = operations['getAgentTask'];
export type GetAgentTaskSuccessResponse =
  SuccessResponse<GetAgentTaskOperation>;

export type GetHealthOperation = operations['getHealth'];
export type GetHealthSuccessResponse = SuccessResponse<GetHealthOperation>;
