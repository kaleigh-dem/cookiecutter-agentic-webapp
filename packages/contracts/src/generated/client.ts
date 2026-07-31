/* This file is generated. Run `pnpm contracts:generate` instead of editing it. */

import type { operations } from './openapi';
import type { SuccessResponse } from './server';

type ParametersOf<T> = T extends { parameters: infer Parameters }
  ? Parameters
  : never;

type ParameterGroup<T, Key extends PropertyKey> =
  ParametersOf<T> extends infer Parameters
    ? Key extends keyof Parameters
      ? NonNullable<Parameters[Key]>
      : never
    : never;

type RequestBody<T> = T extends { requestBody?: infer Body }
  ? [NonNullable<Body>] extends [never]
    ? never
    : NonNullable<Body> extends {
          content: { 'application/json': infer JsonBody };
        }
      ? JsonBody
      : never
  : never;

type RequiredKeys<T> = T extends object
  ? {
      [Key in keyof T]-?: {} extends Pick<T, Key> ? never : Key;
    }[keyof T]
  : never;

type Field<Key extends string, Value, IsRequired extends boolean> = [
  Value,
] extends [never]
  ? { [Property in Key]?: never }
  : IsRequired extends true
    ? { [Property in Key]: Value }
    : { [Property in Key]?: Value };

type ParameterField<
  T,
  GroupKey extends PropertyKey,
  RequestKey extends string,
> = Field<
  RequestKey,
  ParameterGroup<T, GroupKey>,
  GroupKey extends RequiredKeys<ParametersOf<T>>
    ? true
    : [RequiredKeys<ParameterGroup<T, GroupKey>>] extends [never]
      ? false
      : true
>;

type BodyField<T> = Field<
  'body',
  RequestBody<T>,
  'requestBody' extends RequiredKeys<T> ? true : false
>;

export type OperationRequest<T> = ParameterField<T, 'path', 'path'> &
  ParameterField<T, 'query', 'query'> &
  ParameterField<T, 'header', 'headers'> &
  BodyField<T> & {
    readonly additionalHeaders?: HeadersInit;
    readonly signal?: AbortSignal;
  };

export interface ApiClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

export class ApiClientError extends Error {
  public readonly body: unknown;
  public readonly status: number;

  public constructor(status: number, statusText: string, body: unknown) {
    super(`API request failed with ${status} ${statusText}`);
    this.name = 'ApiClientError';
    this.status = status;
    this.body = body;
  }
}

interface RuntimeRequest {
  readonly additionalHeaders?: HeadersInit;
  readonly body?: unknown;
  readonly headers?: Record<string, unknown>;
  readonly path?: Record<string, unknown>;
  readonly query?: Record<string, unknown>;
  readonly signal?: AbortSignal;
}

function appendQueryValue(
  query: URLSearchParams,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(query, key, item);
    }
    return;
  }
  query.append(key, value === null ? '' : String(value));
}

function buildUrl(
  baseUrl: string,
  pathTemplate: string,
  request: RuntimeRequest,
): string {
  let renderedPath = pathTemplate;
  for (const [key, value] of Object.entries(request.path ?? {})) {
    renderedPath = renderedPath.replace(
      `{${key}}`,
      encodeURIComponent(String(value)),
    );
  }
  if (renderedPath.includes('{')) {
    throw new Error(`Missing path parameter for ${renderedPath}`);
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query ?? {})) {
    appendQueryValue(query, key, value);
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${normalizedBase}${renderedPath}`;
  const serializedQuery = query.toString();
  return serializedQuery ? `${url}?${serializedQuery}` : url;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('json') ? JSON.parse(text) : text;
}

export interface ApiClient {
  getHealth(
    request?: OperationRequest<operations['getHealth']>,
  ): Promise<SuccessResponse<operations['getHealth']>>;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!fetchImplementation) {
    throw new Error('A fetch implementation is required.');
  }

  async function execute<ResponseBody>(
    method: string,
    pathTemplate: string,
    request: RuntimeRequest,
  ): Promise<ResponseBody> {
    const baseHeaders =
      typeof options.headers === 'function'
        ? await options.headers()
        : options.headers;
    const headers = new Headers(baseHeaders);
    for (const [key, value] of Object.entries(request.headers ?? {})) {
      if (value !== undefined) {
        headers.set(key, String(value));
      }
    }
    for (const [key, value] of new Headers(
      request.additionalHeaders,
    ).entries()) {
      headers.set(key, value);
    }

    const init: RequestInit = { method, headers };
    if (request.body !== undefined) {
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
      init.body = JSON.stringify(request.body);
    }
    if (request.signal) {
      init.signal = request.signal;
    }

    const response = await fetchImplementation(
      buildUrl(options.baseUrl ?? '', pathTemplate, request),
      init,
    );
    const body = await parseResponse(response);
    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText, body);
    }
    return body as ResponseBody;
  }

  return {
    getHealth(request = {}) {
      return execute<SuccessResponse<operations['getHealth']>>(
        'GET',
        '/api/health',
        request as RuntimeRequest,
      );
    },
  };
}
