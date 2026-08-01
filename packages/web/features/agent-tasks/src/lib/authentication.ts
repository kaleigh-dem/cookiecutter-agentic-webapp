export type BrowserAuthenticationEnvironment = Readonly<
  Record<string, string | undefined>
>;

export interface BrowserAuthenticationAdapter {
  getAccessToken(): string | Promise<string>;
}

export function createDevelopmentAuthenticationAdapter(
  environment: BrowserAuthenticationEnvironment,
): BrowserAuthenticationAdapter {
  if (environment.NODE_ENV === 'production') {
    return {
      getAccessToken() {
        throw new Error(
          'Configure a provider-backed browser authentication adapter in production.',
        );
      },
    };
  }

  return {
    getAccessToken: () => 'local-development-token',
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
