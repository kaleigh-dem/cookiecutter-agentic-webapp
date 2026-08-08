import { describe, expect, it, vi } from 'vitest';

import {
  invokeTool,
  ToolInvocationError,
  type ToolDefinition,
  type ToolRuntimeSchema,
} from './tool-runtime';

interface EchoInput {
  readonly message: string;
}

interface EchoOutput {
  readonly echoed: string;
}

const inputSchema: ToolRuntimeSchema<EchoInput> = {
  parse(value) {
    const message = (value as { message?: unknown })?.message;
    if (typeof message !== 'string' || !message.trim()) {
      throw new Error('message required');
    }
    return { message };
  },
};

const outputSchema: ToolRuntimeSchema<EchoOutput> = {
  parse(value) {
    const echoed = (value as { echoed?: unknown })?.echoed;
    if (typeof echoed !== 'string') throw new Error('echoed required');
    return { echoed };
  },
};

const context = {
  traceId: 'trace-01',
  actorId: 'actor-01',
  conversationId: 'conversation-01',
  providerId: 'provider-01',
  modelId: 'model-01',
  toolCallId: 'call-01',
};

function definition(
  overrides: Partial<ToolDefinition<EchoInput, EchoOutput>> = {},
): ToolDefinition<EchoInput, EchoOutput> {
  return {
    id: 'echo',
    inputSchema,
    outputSchema,
    authorize: () => ({ allowed: true }),
    execute: (_context, input) => ({ echoed: input.message }),
    ...overrides,
  };
}

describe('invokeTool', () => {
  it('validates input, authorizes the authenticated actor, validates output, and preserves identifiers', async () => {
    const authorize = vi.fn(() => ({ allowed: true as const }));
    const execute = vi.fn((_context, input: EchoInput) => ({
      echoed: input.message,
    }));

    const result = await invokeTool(definition({ authorize, execute }), {
      context,
      input: { message: 'hello' },
    });

    expect(authorize).toHaveBeenCalledWith(
      { ...context, toolId: 'echo' },
      { message: 'hello' },
    );
    expect(execute).toHaveBeenCalledWith(
      { ...context, toolId: 'echo' },
      { message: 'hello' },
    );
    expect(result).toEqual({
      ...context,
      toolId: 'echo',
      output: { echoed: 'hello' },
    });
  });

  it('rejects malformed model-provided input before authorization or execution', async () => {
    const authorize = vi.fn(() => ({ allowed: true as const }));
    const execute = vi.fn();

    await expect(
      invokeTool(definition({ authorize, execute }), {
        context,
        input: { message: 42 },
      }),
    ).rejects.toMatchObject({
      code: 'invalid_input',
      toolId: 'echo',
      toolCallId: 'call-01',
      actorId: 'actor-01',
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('denies a valid invocation before the handler and retains the policy reason', async () => {
    const execute = vi.fn();

    await expect(
      invokeTool(
        definition({
          authorize: () => ({ allowed: false, reasonCode: 'missing_scope' }),
          execute,
        }),
        { context, input: { message: 'hello' } },
      ),
    ).rejects.toMatchObject({
      code: 'unauthorized',
      authorizationReason: 'missing_scope',
      traceId: 'trace-01',
      actorId: 'actor-01',
      conversationId: 'conversation-01',
      modelId: 'model-01',
      toolId: 'echo',
      toolCallId: 'call-01',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails closed when authorization returns a malformed runtime decision', async () => {
    const execute = vi.fn();
    const authorize = vi.fn(() => ({ allowed: 'yes' }));

    await expect(
      invokeTool(
        definition({
          authorize: authorize as unknown as ToolDefinition<
            EchoInput,
            EchoOutput
          >['authorize'],
          execute,
        }),
        { context, input: { message: 'hello' } },
      ),
    ).rejects.toMatchObject({
      code: 'authorization_failed',
      traceId: 'trace-01',
      actorId: 'actor-01',
      conversationId: 'conversation-01',
      toolId: 'echo',
      toolCallId: 'call-01',
    });
    expect(authorize).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not expose handler failures through the normalized error cause', async () => {
    let error: unknown;
    try {
      await invokeTool(
        definition({
          execute: () => {
            throw new Error('handler payload SECRET');
          },
        }),
        { context, input: { message: 'hello' } },
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ToolInvocationError);
    expect(error).toMatchObject({
      code: 'execution_failed',
      traceId: 'trace-01',
      actorId: 'actor-01',
      conversationId: 'conversation-01',
      toolId: 'echo',
      toolCallId: 'call-01',
    });
    expect(error).not.toHaveProperty('cause');
    expect(String(error)).not.toContain('SECRET');
  });

  it('rejects malformed tool output without exposing the output in the normalized error', async () => {
    let error: unknown;
    try {
      await invokeTool(
        definition({ execute: () => ({ secret: 'do-not-expose' }) }),
        { context, input: { message: 'hello' } },
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ToolInvocationError);
    expect(error).toMatchObject({
      code: 'invalid_output',
      toolId: 'echo',
      toolCallId: 'call-01',
    });
    expect(error).not.toHaveProperty('cause');
    expect(String(error)).not.toContain('do-not-expose');
  });

  it('rejects empty trusted identity fields before invoking a tool', async () => {
    await expect(
      invokeTool(definition(), {
        context: { ...context, actorId: ' ' },
        input: { message: 'hello' },
      }),
    ).rejects.toMatchObject({
      code: 'invalid_context',
      actorId: ' ',
      toolId: 'echo',
    });
  });
});
