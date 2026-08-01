'use client';

import { createApiClient } from '@agentic-webapp/contracts/client';
import { type FormEvent, useMemo, useState } from 'react';

import {
  createAuthenticationHeaders,
  createDevelopmentAuthenticationAdapter,
} from './authentication';
import {
  type AgentTaskFeatureState,
  validateAgentTaskDraft,
} from './agent-tasks-model';

export function AgentTasksFeature() {
  const client = useMemo(() => {
    const authentication = createDevelopmentAuthenticationAdapter({
      NODE_ENV: process.env.NODE_ENV,
    });
    return createApiClient({
      baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
      headers: createAuthenticationHeaders(authentication),
    });
  }, []);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [taskId, setTaskId] = useState('');
  const [state, setState] = useState<AgentTaskFeatureState>({
    status: 'idle',
    message: 'Create a task to queue an authenticated agent workflow.',
  });

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issues = validateAgentTaskDraft({ title, prompt });
    if (issues.length > 0) {
      setState({ status: 'error', message: issues.join(' ') });
      return;
    }

    setState({ status: 'submitting', message: 'Queuing the agent task…' });
    const correlationId = crypto.randomUUID();
    try {
      const task = await client.createAgentTask({
        headers: {
          'x-correlation-id': correlationId,
        },
        body: { title, prompt },
      });
      setTaskId(task.id);
      setState({
        status: 'success',
        message: `Queued ${task.title} with correlation ${task.correlationId}.`,
      });
    } catch (error: unknown) {
      setState({
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Task creation failed.',
      });
    }
  }

  async function readTask() {
    if (!taskId.trim()) {
      setState({ status: 'error', message: 'Enter a task identifier.' });
      return;
    }
    setState({ status: 'submitting', message: 'Loading the owned task…' });
    try {
      const task = await client.getAgentTask({
        path: { taskId: taskId.trim() },
      });
      setState({
        status: 'success',
        message: `${task.title} is ${task.status} (${task.correlationId}).`,
      });
    } catch (error: unknown) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Task lookup failed.',
      });
    }
  }

  return (
    <section aria-labelledby="agent-tasks-heading">
      <h1 id="agent-tasks-heading">Agent tasks</h1>
      <p>
        This reference workflow authenticates the browser, validates input,
        persists an actor-owned task, writes a correlated execution request to
        the outbox, and exposes the generated client to the browser.
      </p>

      <form onSubmit={createTask}>
        <label>
          Task title
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label>
          Agent prompt
          <textarea
            name="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={4000}
            required
          />
        </label>
        <button type="submit" disabled={state.status === 'submitting'}>
          Create task
        </button>
      </form>

      <div>
        <label>
          Task identifier
          <input
            name="taskId"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => void readTask()}>
          Read owned task
        </button>
      </div>

      <p role="status" aria-live="polite" data-status={state.status}>
        {state.message}
      </p>
    </section>
  );
}
