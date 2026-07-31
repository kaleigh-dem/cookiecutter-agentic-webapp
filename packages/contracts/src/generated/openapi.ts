/* This file is generated. Run `pnpm contracts:generate` instead of editing it. */

export type paths = {
  '/api/agent-tasks': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create an agent task */
    post: operations['createAgentTask'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/agent-tasks/{taskId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read an owned agent task */
    get: operations['getAgentTask'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read API health
     * @description Returns a stable public health response for the API process.
     */
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
};
export type webhooks = Record<string, never>;
export type components = {
  schemas: {
    AgentTaskResponse: {
      correlationId: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      id: string;
      prompt: string;
      /** @enum {string} */
      status: 'queued' | 'running' | 'completed' | 'failed';
      title: string;
    };
    CreateAgentTaskRequest: {
      prompt: string;
      title: string;
    };
    ErrorResponse: {
      code: string;
      message: string;
    };
    HealthResponse: {
      /**
       * @description The service reporting its health.
       * @constant
       */
      service: 'api';
      /**
       * @description The stable healthy status value.
       * @constant
       */
      status: 'ok';
    };
  };
  responses: never;
  parameters: {
    /** @description Development actor context. Phase 8 replaces this adapter with authenticated identity. */
    ActorId: string;
    /** @description Optional caller correlation identifier propagated into persistence and jobs. */
    CorrelationId: string;
  };
  requestBodies: never;
  headers: never;
  pathItems: never;
};
export type SchemaAgentTaskResponse =
  components['schemas']['AgentTaskResponse'];
export type SchemaCreateAgentTaskRequest =
  components['schemas']['CreateAgentTaskRequest'];
export type SchemaErrorResponse = components['schemas']['ErrorResponse'];
export type SchemaHealthResponse = components['schemas']['HealthResponse'];
export type ParameterActorId = components['parameters']['ActorId'];
export type ParameterCorrelationId = components['parameters']['CorrelationId'];
export type $defs = Record<string, never>;
export interface operations {
  createAgentTask: {
    parameters: {
      query?: never;
      header: {
        /** @description Development actor context. Phase 8 replaces this adapter with authenticated identity. */
        'x-actor-id': components['parameters']['ActorId'];
        /** @description Optional caller correlation identifier propagated into persistence and jobs. */
        'x-correlation-id'?: components['parameters']['CorrelationId'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateAgentTaskRequest'];
      };
    };
    responses: {
      /** @description The task was validated and queued. */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentTaskResponse'];
        };
      };
      /** @description The request was invalid. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getAgentTask: {
    parameters: {
      query?: never;
      header: {
        /** @description Development actor context. Phase 8 replaces this adapter with authenticated identity. */
        'x-actor-id': components['parameters']['ActorId'];
        /** @description Optional caller correlation identifier propagated into persistence and jobs. */
        'x-correlation-id'?: components['parameters']['CorrelationId'];
      };
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The owned task. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentTaskResponse'];
        };
      };
      /** @description The task belongs to another actor. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description The task does not exist. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The API is running. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HealthResponse'];
        };
      };
    };
  };
}
