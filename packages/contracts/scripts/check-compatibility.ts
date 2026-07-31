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

function compareParameters(
  baselineOperation: JsonObject,
  currentOperation: JsonObject,
  operationLabel: string,
  issues: string[],
): void {
  const baselineParameters = Array.isArray(baselineOperation.parameters)
    ? baselineOperation.parameters
    : [];
  const currentParameters = Array.isArray(currentOperation.parameters)
    ? currentOperation.parameters
    : [];

  const parameterKey = (parameter: JsonValue): string | undefined => {
    if (!isObject(parameter)) {
      return undefined;
    }
    const name = parameter.name;
    const location = parameter.in;
    return typeof name === 'string' && typeof location === 'string'
      ? `${location}:${name}`
      : undefined;
  };

  const parametersByKey = (parameters: JsonValue[]) =>
    new Map(
      parameters
        .map((parameter) => [parameterKey(parameter), parameter] as const)
        .filter(
          (entry): entry is readonly [string, JsonValue] =>
            entry[0] !== undefined,
        ),
    );

  const baselineByKey = parametersByKey(baselineParameters);
  const currentByKey = parametersByKey(currentParameters);

  for (const [key] of baselineByKey) {
    if (!currentByKey.has(key)) {
      issues.push(`${operationLabel} removed parameter ${key}.`);
    }
  }

  for (const [key, currentParameter] of currentByKey) {
    if (!isObject(currentParameter) || currentParameter.required !== true) {
      continue;
    }

    const baselineParameter = baselineByKey.get(key);
    if (baselineParameter === undefined) {
      issues.push(`${operationLabel} added required parameter ${key}.`);
    } else if (
      !isObject(baselineParameter) ||
      baselineParameter.required !== true
    ) {
      issues.push(`${operationLabel} made parameter ${key} required.`);
    }
  }
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
    if (!isObject(baselinePathItemValue) || !isObject(currentPathItemValue)) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const baselineOperationValue = baselinePathItemValue[method];
      if (baselineOperationValue === undefined) {
        continue;
      }
      const operationLabel = `${method.toUpperCase()} ${routePath}`;
      const currentOperationValue = currentPathItemValue[method];
      if (currentOperationValue === undefined) {
        issues.push(`Removed operation ${operationLabel}.`);
        continue;
      }
      if (
        !isObject(baselineOperationValue) ||
        !isObject(currentOperationValue)
      ) {
        continue;
      }

      if (
        typeof baselineOperationValue.operationId === 'string' &&
        currentOperationValue.operationId !== baselineOperationValue.operationId
      ) {
        issues.push(
          `${operationLabel} changed operationId from ${baselineOperationValue.operationId}.`,
        );
      }

      compareParameters(
        baselineOperationValue,
        currentOperationValue,
        operationLabel,
        issues,
      );

      const baselineRequestBody = baselineOperationValue.requestBody;
      const currentRequestBody = currentOperationValue.requestBody;
      if (
        (!isObject(baselineRequestBody) ||
          baselineRequestBody.required !== true) &&
        isObject(currentRequestBody) &&
        currentRequestBody.required === true
      ) {
        issues.push(`${operationLabel} made the request body required.`);
      }

      const baselineResponses = objectAt(
        baselineOperationValue.responses,
        `${operationLabel} baseline responses`,
        issues,
      );
      const currentResponses = objectAt(
        currentOperationValue.responses,
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
