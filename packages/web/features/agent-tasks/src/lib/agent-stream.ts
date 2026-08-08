import {
  AgentStreamDecoder,
  type AgentStreamEventV1,
} from '@steadystack/contracts';

export type AgentStreamConsumerErrorCode =
  'sequence_mismatch' | 'identity_mismatch';

export class AgentStreamConsumerError extends Error {
  public constructor(
    public readonly code: AgentStreamConsumerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentStreamConsumerError';
  }
}

interface StreamIdentity {
  readonly traceId: string;
  readonly actorId: string;
  readonly conversationId: string;
}

export class AgentStreamConsumer {
  private readonly decoder = new AgentStreamDecoder();
  private expectedSequence = 0;
  private identity: StreamIdentity | undefined;

  public push(chunk: Uint8Array | string): readonly AgentStreamEventV1[] {
    return this.accept(this.decoder.push(chunk));
  }

  public finish(): readonly AgentStreamEventV1[] {
    return this.accept(this.decoder.finish());
  }

  private accept(
    events: readonly AgentStreamEventV1[],
  ): readonly AgentStreamEventV1[] {
    for (const event of events) {
      if (event.sequence !== this.expectedSequence) {
        throw new AgentStreamConsumerError(
          'sequence_mismatch',
          `Expected agent stream sequence ${this.expectedSequence}.`,
        );
      }
      this.expectedSequence += 1;

      const identity = {
        traceId: event.traceId,
        actorId: event.actorId,
        conversationId: event.conversationId,
      };
      if (this.identity === undefined) {
        this.identity = identity;
        continue;
      }
      if (
        identity.traceId !== this.identity.traceId ||
        identity.actorId !== this.identity.actorId ||
        identity.conversationId !== this.identity.conversationId
      ) {
        throw new AgentStreamConsumerError(
          'identity_mismatch',
          'Agent stream identity changed within one response.',
        );
      }
    }
    return events;
  }
}
