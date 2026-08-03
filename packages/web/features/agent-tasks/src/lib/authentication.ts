export type BrowserAuthenticationProfile =
  | 'development'
  | 'none'
  | 'oidc'
  | 'session';

export interface BrowserAuthenticationEnvironment {
  readonly NODE_ENV?: string | undefined;
  readonly NEXT_PUBLIC_AUTHENTICATION_PROFILE?: string | undefined;
  readonly NEXT_PUBLIC_AUTH_SESSION_ENDPOINT?: string | undefined;
  readonly NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS?: string | undefined;
}

export interface BrowserAuthenticationAdapter {
  getAccessToken(): string | null | Promise<string | null>;
  invalidate?(): void;
}

export interface SessionAuthenticationAdapterOptions {
  readonly endpoint: string;
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly now?: (() => number) | undefined;
  readonly refreshSkewMs?: number | undefined;
}

export interface BrowserAuthenticationDependencies {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly now?: (() => number) | undefined;
}

interface SessionCredential {
  readonly accessToken: string;
  readonly expiresAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireSameOriginEndpoint(value: string): string {
  const endpoint = value.trim();
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) {
    throw new Error(
      'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT must be a same-origin absolute path.',
    );
  }
  return endpoint;
}

function parseRefreshSkewMs(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 30_000;
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 300) {
    throw new Error(
      'NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS must be an integer between 0 and 300.',
    );
  }
  return seconds * 1_000;
}

function parseCredential(payload: unknown, nowMs: number): SessionCredential {
  if (!isRecord(payload)) {
    throw new Error('The authentication session endpoint returned invalid JSON.');
  }

  const accessToken = payload.accessToken;
  const rawExpiresAt = payload.expiresAt;
  const expiresAt =
    typeof rawExpiresAt === 'number'
      ? rawExpiresAt
      : typeof rawExpiresAt === 'string'
        ? Date.parse(rawExpiresAt)
        : Number.NaN;

  if (
    typeof accessToken !== 'string' ||
    accessToken.trim() === '' ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= nowMs
  ) {
    throw new Error(
      'The authentication session endpoint returned an invalid credential.',
    );
  }

  return { accessToken: accessToken.trim(), expiresAt };
}

export function createDevelopmentAuthenticationAdapter(
  environment: BrowserAuthenticationEnvironment,
): BrowserAuthenticationAdapter {
  if (environment.NODE_ENV === 'production') {
    return {
      getAccessToken() {
        throw new Error(
          'The development browser authentication adapter cannot run in production.',
        );
      },
    };
  }

  return {
    getAccessToken: () => 'local-development-token',
  };
}

export function createUnauthenticatedAuthenticationAdapter(): BrowserAuthenticationAdapter {
  return {
    getAccessToken: () => null,
  };
}

export function createSessionAuthenticationAdapter(
  options: SessionAuthenticationAdapterOptions,
): BrowserAuthenticationAdapter {
  const endpoint = requireSameOriginEndpoint(options.endpoint);
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const refreshSkewMs = options.refreshSkewMs ?? 30_000;
  if (!fetchImplementation) {
    throw new Error('A fetch implementation is required for session authentication.');
  }
  if (
    !Number.isFinite(refreshSkewMs) ||
    refreshSkewMs < 0 ||
    refreshSkewMs > 300_000
  ) {
    throw new Error('Session authentication refresh skew is out of bounds.');
  }

  let credential: SessionCredential | undefined;
  let renewal: Promise<SessionCredential> | undefined;

  async function renewCredential(): Promise<SessionCredential> {
    const response = await fetchImplementation(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? 'An authenticated browser session is required.'
          : `The authentication session endpoint failed with ${response.status}.`,
      );
    }
    const nextCredential = parseCredential(await response.json(), now());
    credential = nextCredential;
    return nextCredential;
  }

  return {
    async getAccessToken() {
      const currentTime = now();
      if (
        credential &&
        credential.expiresAt - currentTime > refreshSkewMs
      ) {
        return credential.accessToken;
      }

      renewal ??= renewCredential().finally(() => {
        renewal = undefined;
      });
      return (await renewal).accessToken;
    },
    invalidate() {
      credential = undefined;
    },
  };
}

export function createBrowserAuthenticationAdapter(
  environment: BrowserAuthenticationEnvironment,
  dependencies: BrowserAuthenticationDependencies = {},
): BrowserAuthenticationAdapter {
  const configuredProfile =
    environment.NEXT_PUBLIC_AUTHENTICATION_PROFILE?.trim();
  const profile =
    configuredProfile ||
    (environment.NODE_ENV === 'production' ? undefined : 'development');

  if (!profile) {
    throw new Error(
      'NEXT_PUBLIC_AUTHENTICATION_PROFILE is required in production.',
    );
  }
  if (!['development', 'none', 'oidc', 'session'].includes(profile)) {
    throw new Error(
      `Unsupported browser authentication profile: ${profile}.`,
    );
  }

  if (profile === 'development') {
    return createDevelopmentAuthenticationAdapter(environment);
  }
  if (profile === 'none') {
    return createUnauthenticatedAuthenticationAdapter();
  }

  const endpoint = environment.NEXT_PUBLIC_AUTH_SESSION_ENDPOINT?.trim();
  if (!endpoint) {
    throw new Error(
      'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT is required for OIDC and session browser authentication.',
    );
  }

  return createSessionAuthenticationAdapter({
    endpoint,
    fetchImplementation: dependencies.fetchImplementation,
    now: dependencies.now,
    refreshSkewMs: parseRefreshSkewMs(
      environment.NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS,
    ),
  });
}

export function createAuthenticationHeaders(
  adapter: BrowserAuthenticationAdapter,
): () => Promise<HeadersInit> {
  return async () => {
    const accessToken = await adapter.getAccessToken();
    if (accessToken === null) return {};

    const normalizedAccessToken = accessToken.trim();
    if (!normalizedAccessToken) {
      throw new Error(
        'The authentication adapter returned an empty access token.',
      );
    }
    return { authorization: `Bearer ${normalizedAccessToken}` };
  };
}
