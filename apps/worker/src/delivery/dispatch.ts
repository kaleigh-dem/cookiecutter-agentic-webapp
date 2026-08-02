import type {
  ClaimedOutboxMessage,
  PostgresOutboxDelivery,
} from '@agentic-webapp/database';

import {
  agentTaskExecutionRequestedV1Schema,
  agentTaskExecutionRequestedV2Schema,
  type ExecuteAgentTaskJobPayload,
} from '../jobs/execute-agent-task/contract';
import { handleExecuteAgentTaskJob } from '../jobs/execute-agent-task/handler';

export type OutboxDisposition = Pick<
  PostgresOutboxDelivery,
  'acknowledge' | 'fail'
>;

export type ExecuteAgentTaskHandler = (
  payload: ExecuteAgentTaskJobPayload,
  execute?: undefined,
  envelope?: { readonly jobId?: string },
) => Promise<unknown>;

export interface DispatchOutboxMessageOptions {
  readonly delivery: OutboxDisposition;
  readonly handleExecuteAgentTask?: ExecuteAgentTaskHandler;
}

interface SupportedEvent {
  readonly version: 1 | 2;
  readonly parse: (payload: unknown) => ExecuteAgentTaskJobPayload;
}

const supportedEvents: Readonly<Record<string, SupportedEvent>> = {
  'agent-task.execute.v1': {
    version: 1,
    parse: (payload) => agentTaskExecutionRequestedV1Schema.parse(payload),
  },
  'agent-task.execute.v2': {
    version: 2,
    parse: (payload) => agentTaskExecutionRequestedV2Schema.parse(payload),
  },
};

function claimReference(message: ClaimedOutboxMessage) {
  return {
    id: message.id,
    workerId: message.workerId,
    claimToken: message.claimToken,
  };
}

async function quarantine(
  message: ClaimedOutboxMessage,
  delivery: OutboxDisposition,
  errorCode: string,
  errorMessage: string,
): Promise<'quarantined'> {
  const updated = await delivery.fail({
    ...claimReference(message),
    errorCode,
    errorMessage,
  });

  if (!updated) {
    throw new Error(
      `Unable to quarantine outbox message ${message.id}; the claim is no longer current.`,
    );
  }

  return 'quarantined';
}

export async function dispatchOutboxMessage(
  message: ClaimedOutboxMessage,
  options: DispatchOutboxMessageOptions,
): Promise<'acknowledged' | 'quarantined'> {
  const event = supportedEvents[message.kind];
  if (!event) {
    const isKnownFamily = /^agent-task\.execute\.v\d+$/u.test(message.kind);
    return quarantine(
      message,
      options.delivery,
      isKnownFamily ? 'unsupported_event_version' : 'unsupported_event_type',
      isKnownFamily
        ? `The event version in ${message.kind} is not supported by this worker.`
        : `The event type ${message.kind} is not registered by this worker.`,
    );
  }

  let payload: ExecuteAgentTaskJobPayload;
  try {
    payload = event.parse(message.payload);
  } catch {
    return quarantine(
      message,
      options.delivery,
      'invalid_contract',
      `The ${message.kind} payload does not satisfy its versioned contract.`,
    );
  }

  if (payload.version !== event.version) {
    return quarantine(
      message,
      options.delivery,
      'unsupported_event_version',
      `The ${message.kind} payload version does not match the registered event version.`,
    );
  }

  const handle = options.handleExecuteAgentTask ?? handleExecuteAgentTaskJob;
  await handle(payload, undefined, { jobId: message.id });

  const acknowledged = await options.delivery.acknowledge(
    claimReference(message),
  );
  if (!acknowledged) {
    throw new Error(
      `Unable to acknowledge outbox message ${message.id}; the claim is no longer current.`,
    );
  }

  return 'acknowledged';
}
