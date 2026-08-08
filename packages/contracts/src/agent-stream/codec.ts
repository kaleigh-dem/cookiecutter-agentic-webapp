import { agentStreamEventV1Schema, type AgentStreamEventV1 } from './schema';

export function serializeAgentStreamEvent(event: AgentStreamEventV1): string {
  return `${JSON.stringify(agentStreamEventV1Schema.parse(event))}\n`;
}

export function parseAgentStreamEventLine(line: string): AgentStreamEventV1 {
  return agentStreamEventV1Schema.parse(JSON.parse(line) as unknown);
}

export class AgentStreamDecoder {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private finished = false;

  public push(chunk: Uint8Array | string): readonly AgentStreamEventV1[] {
    if (this.finished) {
      throw new Error('Agent stream decoder is already finished.');
    }
    this.buffer +=
      typeof chunk === 'string'
        ? chunk
        : this.decoder.decode(chunk, { stream: true });
    return this.drain(false);
  }

  public finish(): readonly AgentStreamEventV1[] {
    if (this.finished) {
      throw new Error('Agent stream decoder is already finished.');
    }
    this.finished = true;
    this.buffer += this.decoder.decode();
    return this.drain(true);
  }

  private drain(includeTrailing: boolean): readonly AgentStreamEventV1[] {
    const events: AgentStreamEventV1[] = [];
    let boundary = this.buffer.indexOf('\n');
    while (boundary >= 0) {
      const line = this.buffer.slice(0, boundary).trim();
      this.buffer = this.buffer.slice(boundary + 1);
      if (line) events.push(parseAgentStreamEventLine(line));
      boundary = this.buffer.indexOf('\n');
    }

    if (includeTrailing) {
      const trailing = this.buffer.trim();
      this.buffer = '';
      if (trailing) events.push(parseAgentStreamEventLine(trailing));
    }

    return events;
  }
}
