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

export type HealthResponse = components['schemas']['HealthResponse'];

export type GetHealthOperation = operations['getHealth'];
export type GetHealthSuccessResponse = SuccessResponse<GetHealthOperation>;
