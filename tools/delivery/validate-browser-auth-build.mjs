const deployedProfiles = new Set(['none', 'oidc', 'session']);
const sameOriginValidationBase = new URL(
  'https://browser-authentication.invalid',
);

function requireSameOriginEndpoint(value) {
  const endpoint = value.trim();
  let parsedEndpoint;

  try {
    parsedEndpoint = new URL(endpoint, sameOriginValidationBase);
  } catch {
    throw new Error(
      'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT must be a same-origin absolute path.',
    );
  }

  if (
    !endpoint.startsWith('/') ||
    endpoint.startsWith('//') ||
    endpoint.includes('\\') ||
    parsedEndpoint.origin !== sameOriginValidationBase.origin
  ) {
    throw new Error(
      'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT must be a same-origin absolute path.',
    );
  }

  return endpoint;
}

function parseRefreshSkewSeconds(value) {
  const normalized = value?.trim() || '30';
  const seconds = Number(normalized);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 300) {
    throw new Error(
      'NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS must be an integer between 0 and 300.',
    );
  }
  return seconds;
}

export function validateBrowserAuthenticationBuild(environment) {
  const profile = environment.NEXT_PUBLIC_AUTHENTICATION_PROFILE?.trim();
  if (!profile) {
    throw new Error(
      'NEXT_PUBLIC_AUTHENTICATION_PROFILE is required for release image builds.',
    );
  }
  if (!deployedProfiles.has(profile)) {
    throw new Error(
      `Release image builds require one of: ${[...deployedProfiles].join(', ')}.`,
    );
  }

  const configuredEndpoint =
    environment.NEXT_PUBLIC_AUTH_SESSION_ENDPOINT?.trim() ?? '';
  if (profile !== 'none' && !configuredEndpoint) {
    throw new Error(
      'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT is required for OIDC and session release images.',
    );
  }
  const endpoint = configuredEndpoint
    ? requireSameOriginEndpoint(configuredEndpoint)
    : null;

  return {
    profile,
    endpoint,
    refreshSkewSeconds: parseRefreshSkewSeconds(
      environment.NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS,
    ),
  };
}

function main() {
  const result = validateBrowserAuthenticationBuild(process.env);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
