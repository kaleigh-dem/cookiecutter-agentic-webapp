import {
  createRateLimitRules,
  type RateLimitStore,
} from '@agentic-webapp/backend-rate-limit';
import {
  createStructuredLogger,
  getCorrelationContext,
} from '@agentic-webapp/observability';
import {
  type ArgumentsHost,
  type CanActivate,
  Catch,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  type ExceptionFilter,
  Global,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  SetMetadata,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  createOidcVerifierConfig,
  EnvironmentOidcClaimsMapper,
  OidcAccessTokenVerifier,
  type OidcFetch,
  type OidcSecurityEnvironment,
} from './oidc-access-token-verifier';
import {
  EnvironmentRateLimitProvider,
  RATE_LIMIT_STORE,
  resolveClientIp,
} from './rate-limit-provider';

const IS_PUBLIC_KEY = 'security:is-public';
const REQUIRED_PERMISSIONS_KEY = 'security:required-permissions';
const SKIP_RATE_LIMIT_KEY = 'security:skip-rate-limit';
const MAX_AUTHORIZATION_HEADER_LENGTH = 8_192;
const BEARER_SCHEME = 'bearer';

export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

export interface AuthenticatedPrincipal {
  readonly subject: string;
  readonly permissions: readonly string[];
  readonly tenantId?: string;
}

export interface AccessTokenVerifier {
  verify(accessToken: string): Promise<AuthenticatedPrincipal>;
}

export interface SecurityEnvironment extends OidcSecurityEnvironment {
  readonly NODE_ENV?: string;
  readonly AUTH_ACCESS_TOKEN_VERIFIER?: string;
  readonly AUTH_DEVELOPMENT_TOKEN?: string;
  readonly AUTH_DEVELOPMENT_SUBJECT?: string;
  readonly AUTH_DEVELOPMENT_PERMISSIONS?: string;
  readonly AUTH_DEVELOPMENT_TENANT?: string;
}

interface AuthenticatedRequest extends IncomingMessage {
  principal?: AuthenticatedPrincipal;
  readonly ip?: string;
  readonly originalUrl?: string;
  readonly route?: { readonly path?: string };
}

interface JsonResponse extends ServerResponse {
  status(statusCode: number): JsonResponse;
  json(body: unknown): void;
}

export interface SecurityAuditEvent {
  readonly action: string;
  readonly actorId: string;
  readonly outcome: 'allowed' | 'denied';
  readonly resourceType: string;
  readonly resourceId?: string;
  readonly reason?: string;
}

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const principal = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!principal) {
      throw new UnauthorizedException({
        code: 'authentication_required',
        message: 'Authentication is required.',
      });
    }
    return principal;
  },
);

function isHttpWhitespace(characterCode: number): boolean {
  return characterCode === 0x20 || characterCode === 0x09;
}

export function extractBearerToken(
  authorizationHeader: string | string[] | undefined,
): string | undefined {
  if (
    typeof authorizationHeader !== 'string' ||
    authorizationHeader.length > MAX_AUTHORIZATION_HEADER_LENGTH
  ) {
    return undefined;
  }

  const value = authorizationHeader.trim();
  if (
    value.length <= BEARER_SCHEME.length ||
    value.slice(0, BEARER_SCHEME.length).toLowerCase() !== BEARER_SCHEME
  ) {
    return undefined;
  }

  let tokenStart = BEARER_SCHEME.length;
  if (!isHttpWhitespace(value.charCodeAt(tokenStart))) return undefined;
  while (
    tokenStart < value.length &&
    isHttpWhitespace(value.charCodeAt(tokenStart))
  ) {
    tokenStart += 1;
  }

  const accessToken = value.slice(tokenStart).trim();
  return accessToken || undefined;
}

export function hasRequiredPermissions(
  principal: AuthenticatedPrincipal,
  requiredPermissions: readonly string[],
): boolean {
  const granted = new Set(principal.permissions);
  return requiredPermissions.every((permission) => granted.has(permission));
}

export function createTestPrincipal(
  overrides: Partial<AuthenticatedPrincipal> = {},
): AuthenticatedPrincipal {
  return {
    subject: overrides.subject ?? 'test-user',
    permissions: overrides.permissions ?? [],
    ...(overrides.tenantId ? { tenantId: overrides.tenantId } : {}),
  };
}

export function verifyDevelopmentAccessToken(
  accessToken: string,
  environment: SecurityEnvironment,
): AuthenticatedPrincipal {
  if (environment.NODE_ENV === 'production') {
    throw new UnauthorizedException({
      code: 'invalid_access_token',
      message: 'The access token is invalid.',
    });
  }

  const expectedToken =
    environment.AUTH_DEVELOPMENT_TOKEN ?? 'local-development-token';
  const actual = Buffer.from(accessToken);
  const expected = Buffer.from(expectedToken);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new UnauthorizedException({
      code: 'invalid_access_token',
      message: 'The access token is invalid.',
    });
  }

  return {
    subject: environment.AUTH_DEVELOPMENT_SUBJECT ?? 'local-developer',
    permissions: (
      environment.AUTH_DEVELOPMENT_PERMISSIONS ??
      'agent-tasks:read,agent-tasks:write'
    )
      .split(',')
      .map((permission) => permission.trim())
      .filter(Boolean),
    ...(environment.AUTH_DEVELOPMENT_TENANT?.trim()
      ? { tenantId: environment.AUTH_DEVELOPMENT_TENANT.trim() }
      : {}),
  };
}

export function createEnvironmentAccessTokenVerifier(
  environment: SecurityEnvironment,
  fetchImplementation: OidcFetch = fetch,
): AccessTokenVerifier {
  const configuredVerifier = environment.AUTH_ACCESS_TOKEN_VERIFIER?.trim();
  const verifier =
    configuredVerifier ||
    (environment.NODE_ENV === 'production' ? 'oidc' : 'development');

  if (verifier === 'development') {
    return {
      verify: (accessToken) =>
        Promise.resolve(verifyDevelopmentAccessToken(accessToken, environment)),
    };
  }
  if (verifier === 'oidc') {
    return new OidcAccessTokenVerifier(
      createOidcVerifierConfig(environment),
      new EnvironmentOidcClaimsMapper(environment),
      fetchImplementation,
    );
  }
  throw new Error(
    `AUTH_ACCESS_TOKEN_VERIFIER must be development or oidc, received ${verifier}.`,
  );
}

@Injectable()
export class EnvironmentAccessTokenVerifier implements AccessTokenVerifier {
  private readonly verifier = createEnvironmentAccessTokenVerifier(process.env);

  public verify(accessToken: string): Promise<AuthenticatedPrincipal> {
    return this.verifier.verify(accessToken);
  }
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly verifier: AccessTokenVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = extractBearerToken(request.headers.authorization);
    if (!accessToken) {
      throw new UnauthorizedException({
        code: 'authentication_required',
        message: 'A bearer access token is required.',
      });
    }

    const principal = await this.verifier.verify(accessToken);
    request.principal = principal;
    const correlation = getCorrelationContext();
    if (correlation) correlation.userId = principal.subject;
    return true;
  }
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<readonly string[]>(
        REQUIRED_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    if (requiredPermissions.length === 0) return true;

    const principal = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!principal || !hasRequiredPermissions(principal, requiredPermissions)) {
      throw new ForbiddenException({
        code: 'insufficient_permissions',
        message: 'The authenticated actor lacks a required permission.',
      });
    }
    return true;
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly provider: EnvironmentRateLimitProvider,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<ServerResponse>();
    let rejected;
    try {
      rejected = await this.store.consume(
        createRateLimitRules(
          {
            clientIp: resolveClientIp(request),
            method: request.method ?? 'UNKNOWN',
            route:
              request.route?.path ?? request.originalUrl ?? request.url ?? '/',
            ...(request.principal ? { principal: request.principal } : {}),
          },
          this.provider.configuration,
        ),
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'rate_limit_unavailable',
        message: 'Request rate limiting is temporarily unavailable.',
      });
    }
    if (!rejected) return true;

    response.setHeader(
      'retry-after',
      Math.max(1, Math.ceil((rejected.resetAt.getTime() - Date.now()) / 1_000)),
    );
    response.setHeader('x-rate-limit-policy', rejected.policy);
    throw new HttpException(
      {
        code: 'rate_limit_exceeded',
        message: 'Too many requests. Try again later.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class SecurityHeadersMiddleware {
  public use(
    _request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void {
    response.setHeader(
      'content-security-policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    response.setHeader(
      'permissions-policy',
      'camera=(), microphone=(), geolocation=()',
    );
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    if (process.env.NODE_ENV === 'production') {
      response.setHeader(
        'strict-transport-security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  }
}

@Catch()
export class NormalizedHttpExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    const httpException =
      exception instanceof HttpException ? exception : undefined;
    const statusCode =
      httpException?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = httpException?.getResponse();
    const details =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : {};

    response.status(statusCode).json({
      statusCode,
      code:
        typeof details.code === 'string'
          ? details.code
          : statusCode === HttpStatus.INTERNAL_SERVER_ERROR
            ? 'internal_error'
            : 'request_failed',
      message:
        typeof details.message === 'string'
          ? details.message
          : statusCode === HttpStatus.INTERNAL_SERVER_ERROR
            ? 'An unexpected error occurred.'
            : String(exceptionResponse ?? 'Request failed.'),
      requestId: getCorrelationContext()?.requestId,
    });
  }
}

const auditLogger = createStructuredLogger('api-security');

@Injectable()
export class SecurityAuditService {
  public record(event: SecurityAuditEvent): void {
    const correlation = getCorrelationContext();
    auditLogger.info('security.audit', {
      action: event.action,
      actorId: event.actorId,
      outcome: event.outcome,
      resourceType: event.resourceType,
      ...(event.resourceId ? { resourceId: event.resourceId } : {}),
      ...(event.reason ? { reason: event.reason } : {}),
      ...(correlation?.requestId ? { requestId: correlation.requestId } : {}),
      ...(correlation?.traceId ? { traceId: correlation.traceId } : {}),
    });
  }
}

@Global()
@Module({
  providers: [
    SecurityAuditService,
    EnvironmentAccessTokenVerifier,
    EnvironmentRateLimitProvider,
    {
      provide: ACCESS_TOKEN_VERIFIER,
      useExisting: EnvironmentAccessTokenVerifier,
    },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    {
      provide: RATE_LIMIT_STORE,
      inject: [EnvironmentRateLimitProvider],
      useFactory: (provider: EnvironmentRateLimitProvider) => provider.store,
    },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_FILTER, useClass: NormalizedHttpExceptionFilter },
  ],
  exports: [ACCESS_TOKEN_VERIFIER, SecurityAuditService],
})
export class SecurityModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
