export interface ToolRuntimeSchema<T> {
  parse(value: unknown): T;
}

export interface ToolInvocationContext {
  readonly traceId: string;
  readonly actorId: string;
  readonly conversationId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly toolCallId: string;
}

export interface ToolExecutionContext extends ToolInvocationContext {
  readonly toolId: string;
}

export type ToolAuthorizationDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reasonCode: string };

export interface ToolDefinition<TInput, TOutput> {
  readonly id: string;
  readonly inputSchema: ToolRuntimeSchema<TInput>;
  readonly outputSchema: ToolRuntimeSchema<TOutput>;
  readonly authorize: (
    context: ToolExecutionContext,
    input: TInput,
  ) => ToolAuthorizationDecision | Promise<ToolAuthorizationDecision>;
  readonly execute: (
    context: ToolExecutionContext,
    input: TInput,
  ) => unknown | Promise<unknown>;
}

export interface ToolInvocationRequest {
  readonly context: ToolInvocationContext;
  readonly input: unknown;
}

export interface ToolInvocationResult<TOutput> extends ToolExecutionContext {
  readonly output: TOutput;
}

export type ToolInvocationErrorCode =
  | 'invalid_context'
  | 'invalid_input'
  | 'authorization_failed'
  | 'unauthorized'
  | 'execution_failed'
  | 'invalid_output';

export interface ToolInvocationErrorOptions extends ToolExecutionContext {
  readonly code: ToolInvocationErrorCode;
  readonly authorizationReason?: string;
  readonly cause?: unknown;
}

export class ToolInvocationError extends Error {
  public readonly code: ToolInvocationErrorCode;
  public readonly traceId: string;
  public readonly actorId: string;
  public readonly conversationId: string;
  public readonly providerId: string;
  public readonly modelId: string;
  public readonly toolId: string;
  public readonly toolCallId: string;
  public readonly authorizationReason?: string;

  public constructor(message: string, options: ToolInvocationErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'ToolInvocationError';
    this.code = options.code;
    this.traceId = options.traceId;
    this.actorId = options.actorId;
    this.conversationId = options.conversationId;
    this.providerId = options.providerId;
    this.modelId = options.modelId;
    this.toolId = options.toolId;
    this.toolCallId = options.toolCallId;
    if (options.authorizationReason !== undefined) {
      this.authorizationReason = options.authorizationReason;
    }
  }
}

function requireIdentifier(value: string, label: string): void {
  if (!value.trim()) {
    throw new Error(`${label} must not be empty.`);
  }
}

function executionContext(
  toolId: string,
  context: ToolInvocationContext,
): ToolExecutionContext {
  const result = { ...context, toolId };
  try {
    requireIdentifier(result.traceId, 'traceId');
    requireIdentifier(result.actorId, 'actorId');
    requireIdentifier(result.conversationId, 'conversationId');
    requireIdentifier(result.providerId, 'providerId');
    requireIdentifier(result.modelId, 'modelId');
    requireIdentifier(result.toolId, 'toolId');
    requireIdentifier(result.toolCallId, 'toolCallId');
  } catch (cause) {
    throw new ToolInvocationError('Tool invocation context was invalid.', {
      ...result,
      code: 'invalid_context',
      cause,
    });
  }
  return result;
}

export async function invokeTool<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
  request: ToolInvocationRequest,
): Promise<ToolInvocationResult<TOutput>> {
  const context = executionContext(tool.id, request.context);

  let input: TInput;
  try {
    input = tool.inputSchema.parse(request.input);
  } catch (cause) {
    throw new ToolInvocationError('Tool input failed runtime validation.', {
      ...context,
      code: 'invalid_input',
      cause,
    });
  }

  let authorization: ToolAuthorizationDecision;
  try {
    authorization = await tool.authorize(context, input);
  } catch (cause) {
    throw new ToolInvocationError('Tool authorization failed.', {
      ...context,
      code: 'authorization_failed',
      cause,
    });
  }

  if (!authorization.allowed) {
    throw new ToolInvocationError('Tool invocation was not authorized.', {
      ...context,
      code: 'unauthorized',
      authorizationReason: authorization.reasonCode,
    });
  }

  let rawOutput: unknown;
  try {
    rawOutput = await tool.execute(context, input);
  } catch (cause) {
    throw new ToolInvocationError('Tool execution failed.', {
      ...context,
      code: 'execution_failed',
      cause,
    });
  }

  let output: TOutput;
  try {
    output = tool.outputSchema.parse(rawOutput);
  } catch (cause) {
    throw new ToolInvocationError('Tool output failed runtime validation.', {
      ...context,
      code: 'invalid_output',
      cause,
    });
  }

  return { ...context, output };
}
