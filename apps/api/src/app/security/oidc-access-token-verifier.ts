import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  constants,
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

const MAX_ACCESS_TOKEN_LENGTH = 16_384;
const MAX_CACHE_TTL_MS = 3_600_000;
const MAX_CLOCK_SKEW_SECONDS = 300;
const MAX_REQUEST_TIMEOUT_MS = 10_000;
const MIN_REQUEST_TIMEOUT_MS = 100;

export type SupportedJwtAlgorithm =
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'PS256'
  | 'PS384'
  | 'PS512';

const ALGORITHM_PARAMETERS: Record<
  SupportedJwtAlgorithm,
  { readonly hash: string; readonly saltLength?: number }
> = {
  RS256: { hash: 'sha256' },
  RS384: { hash: 'sha384' },
  RS512: { hash: 'sha512' },
  PS256: { hash: 'sha256', saltLength: 32 },
  PS384: { hash: 'sha384', saltLength: 48 },
  PS512: { hash: 'sha512', saltLength: 64 },
};

export interface OidcSecurityEnvironment {
  readonly AUTH_OIDC_ISSUER?: string;
  readonly AUTH_OIDC_AUDIENCE?: string;
  readonly AUTH_OIDC_ALLOWED_ALGORITHMS?: string;
  readonly AUTH_OIDC_CLOCK_SKEW_SECONDS?: string;
  readonly AUTH_OIDC_DISCOVERY_CACHE_TTL_MS?: string;
  readonly AUTH_OIDC_JWKS_CACHE_TTL_MS?: string;
  readonly AUTH_OIDC_REQUEST_TIMEOUT_MS?: string;
  readonly AUTH_OIDC_SUBJECT_CLAIM?: string;
  readonly AUTH_OIDC_PERMISSIONS_CLAIM?: string;
  readonly AUTH_OIDC_SCOPE_CLAIM?: string;
}

export interface OidcVerifierConfig {
  readonly issuer: string;
  readonly audiences: readonly string[];
  readonly allowedAlgorithms: ReadonlySet<SupportedJwtAlgorithm>;
  readonly clockSkewSeconds: number;
  readonly discoveryCacheTtlMs: number;
  readonly jwksCacheTtlMs: number;
  readonly requestTimeoutMs: number;
}

export interface OidcAuthenticatedPrincipal {
  readonly subject: string;
  readonly permissions: readonly string[];
}

export interface OidcClaimsMapper {
  map(claims: Readonly<Record<string, unknown>>): OidcAuthenticatedPrincipal;
}

export type OidcFetch = (input: URL, init?: RequestInit) => Promise<Response>;

interface JwtHeader {
  readonly alg: SupportedJwtAlgorithm;
  readonly kid?: string;
}

interface ParsedJwt {
  readonly encodedHeader: string;
  readonly encodedPayload: string;
  readonly signature: Buffer;
  readonly header: JwtHeader;
  readonly claims: Readonly<Record<string, unknown>>;
}

interface OidcDiscoveryDocument {
  readonly issuer: string;
  readonly jwksUri: string;
}

interface JsonWebKeySet {
  readonly keys: readonly JsonWebKey[];
}

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

function invalidAccessToken(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'invalid_access_token',
    message: 'The access token is invalid.',
  });
}

function identityProviderUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'identity_provider_unavailable',
    message: 'The identity provider is temporarily unavailable.',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `Expected an integer between ${minimum} and ${maximum}, received ${value}.`,
    );
  }
  return parsed;
}

function requiredEnvironmentValue(
  value: string | undefined,
  name: string,
): string {
  const normalized = value?.trim();
  if (!normalized)
    throw new Error(`${name} is required for OIDC verification.`);
  return normalized;
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function requireHttpsUrl(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  return url;
}

export function createOidcDiscoveryUrl(issuer: string): URL {
  const url = requireHttpsUrl(issuer, 'AUTH_OIDC_ISSUER');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/.well-known/openid-configuration`;
  url.search = '';
  url.hash = '';
  return url;
}

export function createOidcVerifierConfig(
  environment: OidcSecurityEnvironment,
): OidcVerifierConfig {
  const issuer = requiredEnvironmentValue(
    environment.AUTH_OIDC_ISSUER,
    'AUTH_OIDC_ISSUER',
  );
  requireHttpsUrl(issuer, 'AUTH_OIDC_ISSUER');

  const audiences = parseCsv(
    requiredEnvironmentValue(
      environment.AUTH_OIDC_AUDIENCE,
      'AUTH_OIDC_AUDIENCE',
    ),
  );
  if (audiences.length === 0) {
    throw new Error('AUTH_OIDC_AUDIENCE must contain at least one audience.');
  }

  const configuredAlgorithms = parseCsv(
    environment.AUTH_OIDC_ALLOWED_ALGORITHMS ?? 'RS256',
  );
  if (configuredAlgorithms.length === 0) {
    throw new Error(
      'AUTH_OIDC_ALLOWED_ALGORITHMS must contain at least one algorithm.',
    );
  }
  const allowedAlgorithms = new Set<SupportedJwtAlgorithm>();
  for (const algorithm of configuredAlgorithms) {
    if (!(algorithm in ALGORITHM_PARAMETERS)) {
      throw new Error(`Unsupported OIDC access-token algorithm: ${algorithm}.`);
    }
    allowedAlgorithms.add(algorithm as SupportedJwtAlgorithm);
  }

  return {
    issuer,
    audiences,
    allowedAlgorithms,
    clockSkewSeconds: parseBoundedInteger(
      environment.AUTH_OIDC_CLOCK_SKEW_SECONDS,
      60,
      0,
      MAX_CLOCK_SKEW_SECONDS,
    ),
    discoveryCacheTtlMs: parseBoundedInteger(
      environment.AUTH_OIDC_DISCOVERY_CACHE_TTL_MS,
      300_000,
      1_000,
      MAX_CACHE_TTL_MS,
    ),
    jwksCacheTtlMs: parseBoundedInteger(
      environment.AUTH_OIDC_JWKS_CACHE_TTL_MS,
      300_000,
      1_000,
      MAX_CACHE_TTL_MS,
    ),
    requestTimeoutMs: parseBoundedInteger(
      environment.AUTH_OIDC_REQUEST_TIMEOUT_MS,
      5_000,
      MIN_REQUEST_TIMEOUT_MS,
      MAX_REQUEST_TIMEOUT_MS,
    ),
  };
}

function readClaim(
  claims: Readonly<Record<string, unknown>>,
  claimPath: string,
): unknown {
  let current: unknown = claims;
  for (const segment of claimPath.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function normalizePermissions(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
  return entries
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export class EnvironmentOidcClaimsMapper implements OidcClaimsMapper {
  private readonly subjectClaim: string;
  private readonly permissionsClaim: string;
  private readonly scopeClaim: string;

  public constructor(environment: OidcSecurityEnvironment) {
    this.subjectClaim = environment.AUTH_OIDC_SUBJECT_CLAIM?.trim() || 'sub';
    this.permissionsClaim =
      environment.AUTH_OIDC_PERMISSIONS_CLAIM?.trim() || 'permissions';
    this.scopeClaim = environment.AUTH_OIDC_SCOPE_CLAIM?.trim() || 'scope';
  }

  public map(
    claims: Readonly<Record<string, unknown>>,
  ): OidcAuthenticatedPrincipal {
    const subject = readClaim(claims, this.subjectClaim);
    if (typeof subject !== 'string' || subject.trim() === '') {
      throw invalidAccessToken();
    }

    const permissions = new Set([
      ...normalizePermissions(readClaim(claims, this.permissionsClaim)),
      ...normalizePermissions(readClaim(claims, this.scopeClaim)),
    ]);

    return {
      subject: subject.trim(),
      permissions: [...permissions],
    };
  }
}

function decodeJsonSegment(segment: string): Readonly<Record<string, unknown>> {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw invalidAccessToken();
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(segment, 'base64url').toString(),
    );
    if (!isRecord(parsed)) throw invalidAccessToken();
    return parsed;
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    throw invalidAccessToken();
  }
}

function parseJwt(accessToken: string): ParsedJwt {
  if (
    accessToken.length === 0 ||
    accessToken.length > MAX_ACCESS_TOKEN_LENGTH
  ) {
    throw invalidAccessToken();
  }
  const segments = accessToken.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment === '')) {
    throw invalidAccessToken();
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments as [
    string,
    string,
    string,
  ];
  const rawHeader = decodeJsonSegment(encodedHeader);
  const rawAlgorithm = rawHeader.alg;
  if (
    typeof rawAlgorithm !== 'string' ||
    !(rawAlgorithm in ALGORITHM_PARAMETERS)
  ) {
    throw invalidAccessToken();
  }
  const rawKid = rawHeader.kid;
  if (rawKid !== undefined && typeof rawKid !== 'string') {
    throw invalidAccessToken();
  }
  if (!/^[A-Za-z0-9_-]+$/.test(encodedSignature)) {
    throw invalidAccessToken();
  }
  const signature = Buffer.from(encodedSignature, 'base64url');
  if (signature.length === 0) throw invalidAccessToken();

  return {
    encodedHeader,
    encodedPayload,
    signature,
    header: {
      alg: rawAlgorithm as SupportedJwtAlgorithm,
      ...(rawKid ? { kid: rawKid } : {}),
    },
    claims: decodeJsonSegment(encodedPayload),
  };
}

function numericDate(
  claims: Readonly<Record<string, unknown>>,
  name: string,
): number {
  const value = claims[name];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidAccessToken();
  }
  return value;
}

function optionalNumericDate(
  claims: Readonly<Record<string, unknown>>,
  name: string,
): number | undefined {
  const value = claims[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidAccessToken();
  }
  return value;
}

function validateClaims(
  claims: Readonly<Record<string, unknown>>,
  config: OidcVerifierConfig,
  nowMs: number,
): void {
  if (claims.iss !== config.issuer) throw invalidAccessToken();

  const audiences = Array.isArray(claims.aud)
    ? claims.aud.filter(
        (audience): audience is string => typeof audience === 'string',
      )
    : typeof claims.aud === 'string'
      ? [claims.aud]
      : [];
  if (!config.audiences.some((audience) => audiences.includes(audience))) {
    throw invalidAccessToken();
  }

  const nowSeconds = Math.floor(nowMs / 1_000);
  const expiresAt = numericDate(claims, 'exp');
  if (nowSeconds >= expiresAt + config.clockSkewSeconds) {
    throw invalidAccessToken();
  }
  const notBefore = optionalNumericDate(claims, 'nbf');
  if (
    notBefore !== undefined &&
    nowSeconds + config.clockSkewSeconds < notBefore
  ) {
    throw invalidAccessToken();
  }
}

function compatibleKeys(
  keys: readonly JsonWebKey[],
  header: JwtHeader,
): JsonWebKey[] {
  const candidates = keys.filter((key) => {
    const keyWithMetadata = key as JsonWebKey & {
      alg?: string;
      key_ops?: string[];
      kid?: string;
      use?: string;
    };
    return (
      key.kty === 'RSA' &&
      typeof key.n === 'string' &&
      typeof key.e === 'string' &&
      (keyWithMetadata.use === undefined || keyWithMetadata.use === 'sig') &&
      (keyWithMetadata.key_ops === undefined ||
        keyWithMetadata.key_ops.includes('verify')) &&
      (keyWithMetadata.alg === undefined ||
        keyWithMetadata.alg === header.alg) &&
      (header.kid === undefined || keyWithMetadata.kid === header.kid)
    );
  });

  if (header.kid === undefined && candidates.length !== 1) return [];
  return candidates;
}

function verifyWithKey(parsed: ParsedJwt, key: KeyObject): boolean {
  const parameters = ALGORITHM_PARAMETERS[parsed.header.alg];
  const data = Buffer.from(
    `${parsed.encodedHeader}.${parsed.encodedPayload}`,
    'ascii',
  );
  if (parameters.saltLength === undefined) {
    return verifySignature(parameters.hash, data, key, parsed.signature);
  }
  return verifySignature(
    parameters.hash,
    data,
    {
      key,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: parameters.saltLength,
    },
    parsed.signature,
  );
}

function verifyWithKeySet(parsed: ParsedJwt, keySet: JsonWebKeySet): boolean {
  for (const jwk of compatibleKeys(keySet.keys, parsed.header)) {
    try {
      const key = createPublicKey({ key: jwk, format: 'jwk' });
      if (verifyWithKey(parsed, key)) return true;
    } catch {
      // Ignore malformed or incompatible keys and try the remaining set.
    }
  }
  return false;
}

async function withinDeadline<T>(
  promise: Promise<T>,
  deadline: number,
  now: () => number,
  onTimeout: () => Error,
): Promise<T> {
  const remaining = deadline - now();
  if (remaining <= 0) throw onTimeout();
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(onTimeout()), remaining);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export class OidcAccessTokenVerifier {
  private discoveryCache?: CacheEntry<OidcDiscoveryDocument>;
  private jwksCache?: CacheEntry<JsonWebKeySet>;

  public constructor(
    private readonly config: OidcVerifierConfig,
    private readonly claimsMapper: OidcClaimsMapper,
    private readonly fetchImplementation: OidcFetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  public async verify(
    accessToken: string,
  ): Promise<OidcAuthenticatedPrincipal> {
    const parsed = parseJwt(accessToken);
    if (!this.config.allowedAlgorithms.has(parsed.header.alg)) {
      throw invalidAccessToken();
    }

    const discovery = await this.getDiscoveryDocument();
    let keySet = await this.getKeySet(discovery.jwksUri, false);
    if (!verifyWithKeySet(parsed, keySet)) {
      keySet = await this.getKeySet(discovery.jwksUri, true);
      if (!verifyWithKeySet(parsed, keySet)) throw invalidAccessToken();
    }

    validateClaims(parsed.claims, this.config, this.now());
    return this.claimsMapper.map(parsed.claims);
  }

  private async getDiscoveryDocument(): Promise<OidcDiscoveryDocument> {
    if (this.discoveryCache && this.discoveryCache.expiresAt > this.now()) {
      return this.discoveryCache.value;
    }

    const payload = await this.fetchJson(
      createOidcDiscoveryUrl(this.config.issuer),
    );
    if (!isRecord(payload)) throw identityProviderUnavailable();
    const issuer = payload.issuer;
    const jwksUri = payload.jwks_uri;
    if (issuer !== this.config.issuer || typeof jwksUri !== 'string') {
      throw identityProviderUnavailable();
    }
    requireHttpsUrl(jwksUri, 'OIDC jwks_uri');

    const document = { issuer, jwksUri };
    this.discoveryCache = {
      value: document,
      expiresAt: this.now() + this.config.discoveryCacheTtlMs,
    };
    return document;
  }

  private async getKeySet(
    jwksUri: string,
    forceRefresh: boolean,
  ): Promise<JsonWebKeySet> {
    if (
      !forceRefresh &&
      this.jwksCache &&
      this.jwksCache.expiresAt > this.now()
    ) {
      return this.jwksCache.value;
    }

    const payload = await this.fetchJson(new URL(jwksUri));
    if (!isRecord(payload) || !Array.isArray(payload.keys)) {
      throw identityProviderUnavailable();
    }
    const keySet = {
      keys: payload.keys.filter(isRecord) as JsonWebKey[],
    };
    if (keySet.keys.length === 0) throw identityProviderUnavailable();

    this.jwksCache = {
      value: keySet,
      expiresAt: this.now() + this.config.jwksCacheTtlMs,
    };
    return keySet;
  }

  private async fetchJson(url: URL): Promise<unknown> {
    const deadline = this.now() + this.config.requestTimeoutMs;
    const controller = new AbortController();
    try {
      const response = await withinDeadline(
        this.fetchImplementation(url, {
          headers: { accept: 'application/json' },
          redirect: 'error',
          signal: controller.signal,
        }),
        deadline,
        this.now,
        () => {
          controller.abort();
          return identityProviderUnavailable();
        },
      );
      if (!response.ok) throw identityProviderUnavailable();
      return await withinDeadline(response.json(), deadline, this.now, () => {
        controller.abort();
        return identityProviderUnavailable();
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw identityProviderUnavailable();
    }
  }
}
