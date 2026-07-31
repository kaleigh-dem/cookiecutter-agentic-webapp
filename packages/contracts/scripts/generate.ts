import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

interface OpenApiOperation {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly requiresInput: boolean;
}

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

const packageRoot = path.resolve(process.cwd(), 'packages/contracts');
const sourcePath = path.join(packageRoot, 'openapi/source/openapi.json');
const generatedOpenApiPath = path.join(
  packageRoot,
  'openapi/generated/openapi.json',
);
const generatedSourceRoot = path.join(packageRoot, 'src/generated');

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(filePath: string): Promise<JsonValue> {
  return JSON.parse(await readFile(filePath, 'utf-8')) as JsonValue;
}

function resolveJsonPointer(document: JsonValue, pointer: string): JsonValue {
  if (!pointer) {
    return document;
  }

  if (!pointer.startsWith('/')) {
    throw new Error(`Unsupported JSON pointer: #${pointer}`);
  }

  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<JsonValue>((current, segment) => {
      if (Array.isArray(current)) {
        const index = Number(segment);
        const value = current[index];
        if (value === undefined) {
          throw new Error(`JSON pointer segment does not exist: ${segment}`);
        }
        return value;
      }

      if (!isObject(current) || !(segment in current)) {
        throw new Error(`JSON pointer segment does not exist: ${segment}`);
      }

      return current[segment] as JsonValue;
    }, document);
}

async function resolveExternalReferences(
  value: JsonValue,
  currentFile: string,
  stack: string[] = [],
): Promise<JsonValue> {
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => resolveExternalReferences(item, currentFile, stack)),
    );
  }

  if (!isObject(value)) {
    return value;
  }

  const reference = value.$ref;
  if (typeof reference === 'string' && !reference.startsWith('#')) {
    const [referenceFile, pointer = ''] = reference.split('#', 2);
    if (!referenceFile) {
      throw new Error(`Invalid external reference: ${reference}`);
    }

    const resolvedFile = path.resolve(path.dirname(currentFile), referenceFile);
    const referenceKey = `${resolvedFile}#${pointer}`;
    if (stack.includes(referenceKey)) {
      throw new Error(`Circular external reference: ${referenceKey}`);
    }

    const referencedDocument = await readJson(resolvedFile);
    const referencedValue = resolveJsonPointer(referencedDocument, pointer);
    const resolvedValue = await resolveExternalReferences(
      referencedValue,
      resolvedFile,
      [...stack, referenceKey],
    );

    const siblingEntries = Object.entries(value).filter(
      ([key]) => key !== '$ref',
    );
    if (siblingEntries.length === 0) {
      return resolvedValue;
    }

    if (!isObject(resolvedValue)) {
      throw new Error(
        `Reference siblings require an object target: ${referenceKey}`,
      );
    }

    const resolvedSiblings = await resolveExternalReferences(
      Object.fromEntries(siblingEntries) as JsonObject,
      currentFile,
      stack,
    );
    if (!isObject(resolvedSiblings)) {
      throw new Error(`Reference siblings must resolve to an object.`);
    }

    return { ...resolvedValue, ...resolvedSiblings };
  }

  const entries = await Promise.all(
    Object.entries(value).map(async ([key, item]) => [
      key,
      await resolveExternalReferences(item, currentFile, stack),
    ]),
  );
  return Object.fromEntries(entries) as JsonObject;
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortJson(value[key] as JsonValue)]),
  ) as JsonObject;
}

function asObject(value: JsonValue | undefined, label: string): JsonObject {
  if (!value || !isObject(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function collectOperations(document: JsonObject): OpenApiOperation[] {
  const paths = asObject(document.paths, 'OpenAPI paths');
  const seenOperationIds = new Set<string>();
  const operations: OpenApiOperation[] = [];

  for (const [routePath, pathItemValue] of Object.entries(paths)) {
    const pathItem = asObject(pathItemValue, `Path item ${routePath}`);

    for (const method of HTTP_METHODS) {
      const operationValue = pathItem[method];
      if (operationValue === undefined) {
        continue;
      }

      const operation = asObject(
        operationValue,
        `Operation ${method.toUpperCase()} ${routePath}`,
      );
      const operationId = operation.operationId;
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw new Error(
          `Operation ${method.toUpperCase()} ${routePath} requires operationId.`,
        );
      }
      if (!/^[$A-Z_a-z][$\w]*$/.test(operationId)) {
        throw new Error(
          `Operation ID must be a valid TypeScript identifier: ${operationId}`,
        );
      }
      if (seenOperationIds.has(operationId)) {
        throw new Error(`Duplicate operationId: ${operationId}`);
      }
      seenOperationIds.add(operationId);

      const parameters = Array.isArray(operation.parameters)
        ? operation.parameters
        : [];
      const hasRequiredParameter = parameters.some((parameter) => {
        if (!isObject(parameter)) {
          return false;
        }
        return parameter.required === true || parameter.in === 'path';
      });
      const requestBody = operation.requestBody;
      const hasRequiredBody =
        isObject(requestBody) && requestBody.required === true;
      const hasPathTemplate = routePath.includes('{');

      operations.push({
        operationId,
        method,
        path: routePath,
        requiresInput:
          hasRequiredParameter || hasRequiredBody || hasPathTemplate,
      });
    }
  }

  return operations.sort((left, right) =>
    left.operationId.localeCompare(right.operationId),
  );
}

function pascalCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}

function generateServerTypes(
  document: JsonObject,
  operations: OpenApiOperation[],
): string {
  const components = asObject(document.components, 'OpenAPI components');
  const schemas = asObject(components.schemas, 'OpenAPI component schemas');
  const lines = [
    '/* This file is generated. Run `pnpm contracts:generate` instead of editing it. */',
    '',
    "import type { components, operations } from './openapi';",
    '',
    "type JsonResponseBody<T> = T extends { content: { 'application/json': infer Body } }",
    '  ? Body',
    '  : never;',
    '',
    'export type SuccessResponse<T> = T extends { responses: infer Responses }',
    '  ? Responses extends { 200: infer Response }',
    '    ? JsonResponseBody<Response>',
    '    : Responses extends { 201: infer Response }',
    '      ? JsonResponseBody<Response>',
    '      : Responses extends { 202: infer Response }',
    '        ? JsonResponseBody<Response>',
    '        : Responses extends { 203: infer Response }',
    '          ? JsonResponseBody<Response>',
    '          : Responses extends { 204: infer Response }',
    '            ? JsonResponseBody<Response>',
    '            : never',
    '  : never;',
    '',
  ];

  for (const schemaName of Object.keys(schemas).sort((left, right) =>
    left.localeCompare(right),
  )) {
    lines.push(
      `export type ${pascalCase(schemaName)} = components['schemas'][${JSON.stringify(schemaName)}];`,
    );
  }

  if (Object.keys(schemas).length > 0) {
    lines.push('');
  }

  for (const operation of operations) {
    const alias = pascalCase(operation.operationId);
    lines.push(
      `export type ${alias}Operation = operations[${JSON.stringify(operation.operationId)}];`,
      `export type ${alias}SuccessResponse = SuccessResponse<${alias}Operation>;`,
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function generateClient(operations: OpenApiOperation[]): string {
  const lines = [
    '/* This file is generated. Run `pnpm contracts:generate` instead of editing it. */',
    '',
    "import type { operations } from './openapi';",
    "import type { SuccessResponse } from './server';",
    '',
    'type ParametersOf<T> = T extends { parameters: infer Parameters }',
    '  ? Parameters',
    '  : never;',
    '',
    'type ParameterGroup<T, Key extends PropertyKey> = ParametersOf<T> extends infer Parameters',
    '  ? Key extends keyof Parameters',
    '    ? NonNullable<Parameters[Key]>',
    '    : never',
    '  : never;',
    '',
    "type RequestBody<T> = T extends { requestBody?: infer Body }",
    "  ? Body extends { content: { 'application/json': infer JsonBody } }",
    '    ? JsonBody',
    '    : never',
    '  : never;',
    '',
    "type OptionalField<Key extends string, Value> = [Value] extends [never]",
    '  ? { [Property in Key]?: never }',
    '  : { [Property in Key]?: Value };',
    '',
    'export type OperationRequest<T> = OptionalField<',
    "  'path',",
    "  ParameterGroup<T, 'path'>",
    '> &',
    '  OptionalField<',
    "    'query',",
    "    ParameterGroup<T, 'query'>",
    '  > &',
    '  OptionalField<',
    "    'headers',",
    "    ParameterGroup<T, 'header'>",
    '  > &',
    "  OptionalField<'body', RequestBody<T>> & {",
    '    readonly additionalHeaders?: HeadersInit;',
    '    readonly signal?: AbortSignal;',
    '  };',
    '',
    'export interface ApiClientOptions {',
    '  readonly baseUrl?: string;',
    '  readonly fetch?: typeof fetch;',
    '  readonly headers?:',
    '    | HeadersInit',
    '    | (() => HeadersInit | Promise<HeadersInit>);',
    '}',
    '',
    'export class ApiClientError extends Error {',
    '  public readonly body: unknown;',
    '  public readonly status: number;',
    '',
    '  public constructor(status: number, statusText: string, body: unknown) {',
    '    super(`API request failed with ${status} ${statusText}`);',
    "    this.name = 'ApiClientError';",
    '    this.status = status;',
    '    this.body = body;',
    '  }',
    '}',
    '',
    'interface RuntimeRequest {',
    '  readonly additionalHeaders?: HeadersInit;',
    '  readonly body?: unknown;',
    '  readonly headers?: Record<string, unknown>;',
    '  readonly path?: Record<string, unknown>;',
    '  readonly query?: Record<string, unknown>;',
    '  readonly signal?: AbortSignal;',
    '}',
    '',
    'function appendQueryValue(',
    '  query: URLSearchParams,',
    '  key: string,',
    '  value: unknown,',
    '): void {',
    '  if (value === undefined) {',
    '    return;',
    '  }',
    '  if (Array.isArray(value)) {',
    '    for (const item of value) {',
    '      appendQueryValue(query, key, item);',
    '    }',
    '    return;',
    '  }',
    '  query.append(key, value === null ? "" : String(value));',
    '}',
    '',
    'function buildUrl(',
    '  baseUrl: string,',
    '  pathTemplate: string,',
    '  request: RuntimeRequest,',
    '): string {',
    '  let renderedPath = pathTemplate;',
    '  for (const [key, value] of Object.entries(request.path ?? {})) {',
    '    renderedPath = renderedPath.replace(',
    '      `{${key}}`,',
    '      encodeURIComponent(String(value)),',
    '    );',
    '  }',
    '  if (renderedPath.includes("{")) {',
    '    throw new Error(`Missing path parameter for ${renderedPath}`);',
    '  }',
    '',
    '  const query = new URLSearchParams();',
    '  for (const [key, value] of Object.entries(request.query ?? {})) {',
    '    appendQueryValue(query, key, value);',
    '  }',
    '',
    "  const normalizedBase = baseUrl.endsWith('/')",
    '    ? baseUrl.slice(0, -1)',
    '    : baseUrl;',
    '  const url = `${normalizedBase}${renderedPath}`;',
    '  const serializedQuery = query.toString();',
    '  return serializedQuery ? `${url}?${serializedQuery}` : url;',
    '}',
    '',
    'async function parseResponse(response: Response): Promise<unknown> {',
    '  if (response.status === 204) {',
    '    return undefined;',
    '  }',
    '  const text = await response.text();',
    '  if (!text) {',
    '    return undefined;',
    '  }',
    '  const contentType = response.headers.get("content-type") ?? "";',
    '  return contentType.includes("json") ? JSON.parse(text) : text;',
    '}',
    '',
    'export interface ApiClient {',
  ];

  for (const operation of operations) {
    const methodName = operation.operationId;
    const operationType = `operations[${JSON.stringify(operation.operationId)}]`;
    const request = `OperationRequest<${operationType}>`;
    const response = `SuccessResponse<${operationType}>`;
    lines.push(
      `  ${methodName}(request${operation.requiresInput ? '' : '?'}: ${request}): Promise<${response}>;`,
    );
  }

  lines.push(
    '}',
    '',
    'export function createApiClient(options: ApiClientOptions = {}): ApiClient {',
    '  const fetchImplementation = options.fetch ?? globalThis.fetch;',
    '  if (!fetchImplementation) {',
    '    throw new Error("A fetch implementation is required.");',
    '  }',
    '',
    '  async function execute<ResponseBody>(',
    '    method: string,',
    '    pathTemplate: string,',
    '    request: RuntimeRequest,',
    '  ): Promise<ResponseBody> {',
    '    const baseHeaders =',
    '      typeof options.headers === "function"',
    '        ? await options.headers()',
    '        : options.headers;',
    '    const headers = new Headers(baseHeaders);',
    '    for (const [key, value] of Object.entries(request.headers ?? {})) {',
    '      if (value !== undefined) {',
    '        headers.set(key, String(value));',
    '      }',
    '    }',
    '    for (const [key, value] of new Headers(',
    '      request.additionalHeaders,',
    '    ).entries()) {',
    '      headers.set(key, value);',
    '    }',
    '',
    '    const init: RequestInit = { method, headers };',
    '    if (request.body !== undefined) {',
    '      if (!headers.has("content-type")) {',
    '        headers.set("content-type", "application/json");',
    '      }',
    '      init.body = JSON.stringify(request.body);',
    '    }',
    '    if (request.signal) {',
    '      init.signal = request.signal;',
    '    }',
    '',
    '    const response = await fetchImplementation(',
    '      buildUrl(options.baseUrl ?? "", pathTemplate, request),',
    '      init,',
    '    );',
    '    const body = await parseResponse(response);',
    '    if (!response.ok) {',
    '      throw new ApiClientError(response.status, response.statusText, body);',
    '    }',
    '    return body as ResponseBody;',
    '  }',
    '',
    '  return {',
  );

  for (const operation of operations) {
    const operationType = `operations[${JSON.stringify(operation.operationId)}]`;
    const defaultValue = operation.requiresInput ? '' : ' = {}';
    lines.push(
      `    ${operation.operationId}(request${defaultValue}) {`,
      `      return execute<SuccessResponse<${operationType}>>(`,
      `        ${JSON.stringify(operation.method.toUpperCase())},`,
      `        ${JSON.stringify(operation.path)},`,
      '        request as RuntimeRequest,',
      '      );',
      '    },',
    );
  }

  lines.push('  };', '}', '');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const source = await readJson(sourcePath);
  if (!isObject(source)) {
    throw new Error('OpenAPI source must be a JSON object.');
  }
  if (
    typeof source.openapi !== 'string' ||
    !source.openapi.startsWith('3.1.')
  ) {
    throw new Error('OpenAPI source must use OpenAPI 3.1.x.');
  }

  const bundledValue = sortJson(
    await resolveExternalReferences(source, sourcePath),
  );
  if (!isObject(bundledValue)) {
    throw new Error('Bundled OpenAPI document must be an object.');
  }

  const operations = collectOperations(bundledValue);
  asObject(
    asObject(bundledValue.components, 'OpenAPI components').schemas,
    'OpenAPI component schemas',
  );

  await mkdir(path.dirname(generatedOpenApiPath), { recursive: true });
  await mkdir(generatedSourceRoot, { recursive: true });
  await writeFile(
    generatedOpenApiPath,
    `${JSON.stringify(bundledValue, null, 2)}\n`,
    'utf-8',
  );

  const ast = await openapiTS(pathToFileURL(generatedOpenApiPath), {
    exportType: true,
    rootTypes: true,
  });
  await writeFile(
    path.join(generatedSourceRoot, 'openapi.ts'),
    `/* This file is generated. Run \`pnpm contracts:generate\` instead of editing it. */\n\n${astToString(ast)}`,
    'utf-8',
  );
  await writeFile(
    path.join(generatedSourceRoot, 'server.ts'),
    generateServerTypes(bundledValue, operations),
    'utf-8',
  );
  await writeFile(
    path.join(generatedSourceRoot, 'client.ts'),
    generateClient(operations),
    'utf-8',
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
