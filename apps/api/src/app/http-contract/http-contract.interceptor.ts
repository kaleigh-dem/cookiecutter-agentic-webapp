import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

interface ContractIssue {
  readonly code: string;
  readonly keys?: readonly string[];
  readonly message: string;
  readonly path: readonly PropertyKey[];
}

interface ContractSchema {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: unknown }
    | {
        readonly success: false;
        readonly error: { readonly issues: readonly ContractIssue[] };
      };
}

type RequestLocation = 'body' | 'headers' | 'path' | 'query';

export interface RuntimeHttpContract {
  readonly request: Readonly<Record<RequestLocation, ContractSchema>>;
  readonly responses: Readonly<Record<string, ContractSchema>>;
}

interface HttpRequest {
  readonly body?: unknown;
  readonly headers?: unknown;
  readonly params?: unknown;
  readonly query?: unknown;
}

interface HttpResponse {
  readonly statusCode?: number;
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '$' : path.map(String).join('.');
}

function validateRequestLocation(
  schema: ContractSchema,
  location: RequestLocation,
  value: unknown,
): void {
  const result = schema.safeParse(value);
  if (result.success) return;

  throw new BadRequestException({
    code: 'validation_failed',
    message: 'Request validation failed.',
    fields: result.error.issues.flatMap((issue) => {
      const paths = issue.keys?.length
        ? issue.keys.map((key) => [...issue.path, key])
        : [issue.path];
      return paths.map((path) => ({
        location,
        path: formatPath(path),
        code: issue.code,
        message: issue.message,
      }));
    }),
  });
}

@Injectable()
export class HttpContractInterceptor implements NestInterceptor {
  public constructor(private readonly contract: RuntimeHttpContract) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();

    validateRequestLocation(this.contract.request.body, 'body', request.body);
    validateRequestLocation(
      this.contract.request.headers,
      'headers',
      request.headers ?? {},
    );
    validateRequestLocation(
      this.contract.request.path,
      'path',
      request.params ?? {},
    );
    validateRequestLocation(
      this.contract.request.query,
      'query',
      request.query ?? {},
    );

    return next.handle().pipe(
      map((body) => {
        const response = http.getResponse<HttpResponse>();
        const status = String(response.statusCode ?? HttpStatus.OK);
        const schema = this.contract.responses[status];
        if (!schema) {
          throw new InternalServerErrorException({
            code: 'undocumented_response',
            message: 'The handler selected an undocumented response status.',
          });
        }

        const result = schema.safeParse(body);
        if (!result.success) {
          throw new InternalServerErrorException({
            code: 'response_validation_failed',
            message: 'The handler produced an invalid response.',
          });
        }
        return result.data;
      }),
    );
  }
}
