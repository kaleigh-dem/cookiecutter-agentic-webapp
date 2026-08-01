export type BrowserAuthenticationEnvironment = Readonly<
  Record<string, string | undefined>
>;

export interface BrowserAuthenticationAdapter {
  getAccessToken(): string | Promise<string>;
}

export function createDevelopmentAuthenticationAdapter(
  environment: BrowserAuthenticationEnvironment,
): BrowserAuthenticationAdapter {
  const production = environment.NODE_ENV === 'production';
  const explicitlyEnabled =
    environment.NEXT_PUBLIC_AUTH_DEVELOPMENT_ENABLED === 'true';
  const configuredToken =
    environment.NEXT_PUBLIC_AUTH_DEVELOPMENT_TOKEN?.trim();

  if (production && (!explicitlyEnabled || !configuredToken)) {
    return {
      getAccessToken() {
        throw new Error(
          'Configure a provider-backed browser authentication adapter in production.',
        );
      },
    };
  }

  const accessToken = configuredToken || 'local-development-token';
  return {
    getAccessToken: () => accessToken,
  };
}

export function createAuthenticationHeaders(
  adapter: BrowserAuthenticationAdapter,
): () => Promise<HeadersInit> {
  return async () => {
    const accessToken = (await adapter.getAccessToken()).trim();
    if (!accessToken) {
      throw new Error(
        'The authentication adapter returned an empty access token.',
      );
    }
    return { authorization: `Bearer ${accessToken}` };
  };
}
