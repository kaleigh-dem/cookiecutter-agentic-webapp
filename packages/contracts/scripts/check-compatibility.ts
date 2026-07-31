import { readFile } from 'node:fs/promises';
import path from 'node:path';

type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

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
const baselinePath = path.resolve(
  process.env.OPENAPI_BASELINE_PATH ??
    path.join(packageRoot, 'openapi/baseline/openapi.json'),
);
const currentPath = path.resolve(
  process.env.OPENAPI_CURRENT_PATH ??
    path.join(packageRoot, 'openapi/generated/openapi.json'),
);

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(filePath: string): Promise<JsonObject> {
  const value = JSON.parse(await readFile(filePath, 'utf-8')) as JsonValue;
  if (!isObject(value)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }
  return value;
}

function objectAt(
  value: JsonValue | undefined,
  label: string,
  issues: string[],
): JsonObject {
  if (!isObject(value)) {
    issues.push(`${label} is missing or is not an object.`);
    return {};
  }
  return value;
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
        const value = current[Number(segment)];
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

function resolveLocalReference(
  document: JsonObject,
  value: JsonValue,
  label: string,
  stack: string[] = [],
): JsonObject {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const reference = value.$ref;
  if (typeof reference !== 'string') {
    return value;
  }
  if (!reference.startsWith('#')) {
    throw new Error(`Unresolved external reference in ${label}: ${reference}`);
  }
  if (stack.includes(reference)) {
    throw new Error(`Circular local reference in ${label}: ${reference}`);
  }

  const target = resolveLocalReference(
    document,
    resolveJsonPointer(document, reference.slice(1)),
    label,
    [...stack, reference],
  );
  const siblings = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== '$ref'),
  ) as JsonObject;
  return { ...target, ...siblings };
}

function parameterKey(parameter: JsonObject): string {
  const name = parameter.name;
  const location = parameter.in;
  if (typeof name !== 'string' || typeof location !== 'string') {
    throw new Error('OpenAPI parameters require string name and in fields.');
  }
  return `${location}:${name}`;
}

function collectEffectiveParameters(
  document: JsonObject,
  pathItem: JsonObject,
  operation: JsonObject,
  operationLabel: string,
): Map<string, JsonObject> {
  const parametersByKey = new Map<string, JsonObject>();
  for (const parameterSource of [pathItem.parameters, operation.parameters]) {
    if (!Array.isArray(parameterSource)) {
      continue;
    }
    for (const parameterValue of parameterSource) {
      const parameter = resolveLocalReference(
        document,
        parameterValue,
        `${operationLabel} parameter`,
      );
      parametersByKey.set(parameterKey(parameter), parameter);
    }
  }
  return parametersByKey;
}

function compareParameters(
  baselineByKey: Map<string, JsonObject>,
  currentByKey: Map<string, JsonObject>,
  operationLabel: string,
  issues: string[],
): void {
  for (const [key] of baselineByKey) {
    if (!currentByKey.has(key)) {
      issues.push(`${operationLabel} removed parameter ${key}.`);
    }
  }

  for (const [key, currentParameter] of currentByKey) {
    if (currentParameter.required !== true) {
      continue;
    }

    const baselineParameter = baselineByKey.get(key);
    if (baselineParameter === undefined) {
      issues.push(`${operationLabel} added required parameter ${key}.`);
    } else if (baselineParameter.required !== true) {
      issues.push(`${operationLabel} made parameter ${key} required.`);
    }
  }
}

function requestBodyIsRequired(
  document: JsonObject,
  operation: JsonObject,
  operationLabel: string,
): boolean {
  const requestBody = operation.requestBody;
  if (requestBody === undefined) {
    return false;
  }
  return (
    resolveLocalReference(
      document,
      requestBody,
      `${operationLabel} request body`,
    ).required === true
  );
}

function compareSchemas(
  baselineSchemas: JsonObject,
  currentSchemas: JsonObject,
  issues: string[],
): void {
  for (const [schemaName, baselineSchemaValue] of Object.entries(
    baselineSchemas,
  )) {
    const currentSchemaValue = currentSchemas[schemaName];
    if (currentSchemaValue === undefined) {
      issues.push(`Removed component schema ${schemaName}.`);
      continue;
    }
    if (!isObject(baselineSchemaValue) || !isObject(currentSchemaValue)) {
      continue;
    }

    if (
      typeof baselineSchemaValue.type === 'string' &&
      currentSchemaValue.type !== baselineSchemaValue.type
    ) {
      issues.push(
        `Component schema ${schemaName} changed type from ${baselineSchemaValue.type}.`,
      );
    }

    const baselineProperties = isObject(baselineSchemaValue.properties)
      ? baselineSchemaValue.properties
      : {};
    const currentProperties = isObject(currentSchemaValue.properties)
      ? currentSchemaValue.properties
      : {};
    for (const propertyName of Object.keys(baselineProperties)) {
      if (!(propertyName in currentProperties)) {
        issues.push(
          `Component schema ${schemaName} removed property ${propertyName}.`,
        );
      }
    }

    const baselineRequired = new Set(
      Array.isArray(baselineSchemaValue.required)
        ? baselineSchemaValue.required.filter(
            (property): property is string => typeof property === 'string',
          )
        : [],
    );
    const currentRequired = Array.isArray(currentSchemaValue.required)
      ? currentSchemaValue.required.filter(
          (property): property is string => typeof property === 'string',
        )
      : [];
    for (const propertyName of currentRequired) {
      if (
        propertyName in baselineProperties &&
        !baselineRequired.has(propertyName)
      ) {
        issues.push(
          `Component schema ${schemaName} made property ${propertyName} required.`,
        );
      }
    }

    const baselineEnum = Array.isArray(baselineSchemaValue.enum)
      ? baselineSchemaValue.enum
      : [];
    const currentEnum = Array.isArray(currentSchemaValue.enum)
      ? currentSchemaValue.enum
      : [];
    if (baselineEnum.length > 0 && currentEnum.length > 0) {
      for (const enumValue of baselineEnum) {
        if (!currentEnum.some((candidate) => candidate === enumValue)) {
          issues.push(
            `Component schema ${schemaName} removed enum value ${JSON.stringify(enumValue)}.`,
          );
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const baseline = await readJson(baselinePath);
  const current = await readJson(currentPath);
  const issues: string[] = [];

  const baselinePaths = objectAt(baseline.paths, 'Baseline paths', issues);
  const currentPaths = objectAt(current.paths, 'Current paths', issues);

  for (const [routePath, baselinePathItemValue] of Object.entries(
    baselinePaths,
  )) {
    const currentPathItemValue = currentPaths[routePath];
    if (currentPathItemValue === undefined) {
      issues.push(`Removed path ${routePath}.`);
      continue;
    }

    const baselinePathItem = resolveLocalReference(
      baseline,
      baselinePathItemValue,
      `Baseline path item ${routePath}`,
    );
    const currentPathItem = resolveLocalReference(
      current,
      currentPathItemValue,
      `Current path item ${routePath}`,
    );

    for (const method of HTTP_METHODS) {
      const baselineOperationValue = baselinePathItem[method];
      if (baselineOperationValue === undefined) {
        continue;
      }
      const operationLabel = `${method.toUpperCase()} ${routePath}`;
      const currentOperationValue = currentPathItem[method];
      if (currentOperationValue === undefined) {
        issues.push(`Removed operation ${operationLabel}.`);
        continue;
      }

      const baselineOperation = resolveLocalReference(
        baseline,
        baselineOperationValue,
        `Baseline operation ${operationLabel}`,
      );
      const currentOperation = resolveLocalReference(
        current,
        currentOperationValue,
        `Current operation ${operationLabel}`,
      );

      if (
        typeof baselineOperation.operationId === 'string' &&
        currentOperation.operationId !== baselineOperation.operationId
      ) {
        issues.push(
          `${operationLabel} changed operationId from ${baselineOperation.operationId}.`,
        );
      }

      compareParameters(
        collectEffectiveParameters(
          baseline,
          baselinePathItem,
          baselineOperation,
          operationLabel,
        ),
        collectEffectiveParameters(
          current,
          currentPathItem,
          currentOperation,
          operationLabel,
        ),
        operationLabel,
        issues,
      );

      if (
        !requestBodyIsRequired(baseline, baselineOperation, operationLabel) &&
        requestBodyIsRequired(current, currentOperation, operationLabel)
      ) {
        issues.push(`${operationLabel} made the request body required.`);
      }

      const baselineResponses = objectAt(
        baselineOperation.responses,
        `${operationLabel} baseline responses`,
        issues,
      );
      const currentResponses = objectAt(
        currentOperation.responses,
        `${operationLabel} current responses`,
        issues,
      );
      for (const responseCode of Object.keys(baselineResponses)) {
        if (!(responseCode in currentResponses)) {
          issues.push(`${operationLabel} removed response ${responseCode}.`);
        }
      }
    }
  }

  const baselineComponents = objectAt(
    baseline.components,
    'Baseline components',
    issues,
  );
  const currentComponents = objectAt(
    current.components,
    'Current components',
    issues,
  );
  compareSchemas(
    objectAt(baselineComponents.schemas, 'Baseline component schemas', issues),
    objectAt(currentComponents.schemas, 'Current component schemas', issues),
    issues,
  );

  if (issues.length > 0) {
    console.error('OpenAPI compatibility check failed:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('OpenAPI contract is backward compatible with the baseline.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
