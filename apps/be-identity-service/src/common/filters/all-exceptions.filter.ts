import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { STATUS_CODES } from 'node:http';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  path: string;
  timestamp: string;
}

function messageOf(exception: HttpException): string | string[] {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  const { message } = response as { message?: unknown };

  return typeof message === 'string' || Array.isArray(message)
    ? (message as string | string[])
    : exception.message;
}

function toError(exception: unknown): Error {
  return exception instanceof Error ? exception : new Error(String(exception));
}

/**
 * Single exit point for every unhandled error: shapes the JSON response and emits the log line
 * (4xx as warn, 5xx as error with a stack) so that no handler has to log failures itself.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const http = host.switchToHttp();
    const request = http.getRequest<{ id?: string; method?: string }>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const isServerError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    const reason = isHttpException ? messageOf(exception) : toError(exception).message;

    const body: ErrorResponseBody = {
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Error',
      // Internal failure details stay in the logs and never reach the caller.
      message: isServerError ? 'Internal server error' : reason,
      requestId: request.id,
      path: httpAdapter.getRequestUrl(request) as string,
      timestamp: new Date().toISOString(),
    };

    if (isServerError) {
      this.logger.error(
        { err: toError(exception), statusCode: status },
        `${request.method ?? 'UNKNOWN'} ${body.path} failed`,
      );
    } else {
      this.logger.warn(
        { statusCode: status, reason },
        `${request.method ?? 'UNKNOWN'} ${body.path} rejected`,
      );
    }

    httpAdapter.reply(http.getResponse(), body, status);
  }
}
