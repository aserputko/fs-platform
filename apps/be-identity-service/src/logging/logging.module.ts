import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule, type Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';

import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { Env } from '../config/env';

const REQUEST_ID_HEADER = 'x-request-id';

/** Only echo a caller-supplied id when it is short and opaque, so it cannot forge log fields or split headers. */
const SAFE_REQUEST_ID = /^[\w-]{1,128}$/;

/** Liveness probes, JWKS polling and Swagger assets would otherwise drown out real traffic. */
const UNLOGGED_ROUTE_PREFIXES = ['/health', '/.well-known/jwks.json', '/docs'];

/**
 * Bodies are never logged, so these guard against credentials arriving through headers or
 * through an object that some future code path passes to the logger directly.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'token',
  '*.token',
];

type Req = IncomingMessage & { id?: string; url?: string; user?: AuthenticatedUser };

interface SerializedReq {
  id?: unknown;
  method?: string;
  url?: string;
  remoteAddress?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface SerializedRes {
  statusCode: number;
}

function pathOf(url: string | undefined): string {
  return (url ?? '').split('?')[0];
}

function isUnlogged(url: string | undefined): boolean {
  const path = pathOf(url);
  return UNLOGGED_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function resolveRequestId(req: Req, res: ServerResponse): string {
  const header = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(header) ? header[0] : header;
  const id = candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, id);

  return id;
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Params => {
        const pretty = config.get('LOG_PRETTY', { infer: true });

        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            messageKey: 'message',
            timestamp: stdTimeFunctions.isoTime,
            base: {
              service: 'be-identity-service',
              env: config.get('NODE_ENV', { infer: true }),
            },
            // pino-pretty renders labels itself, and level formatters are rejected by worker transports.
            ...(pretty
              ? {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      messageKey: 'message',
                      singleLine: true,
                      translateTime: 'SYS:standard',
                      ignore: 'pid,hostname,service,env',
                    },
                  },
                }
              : { formatters: { level: (label: string) => ({ level: label }) } }),
            redact: { paths: REDACTED_PATHS, censor: '[Redacted]' },
            genReqId: (req, res) => resolveRequestId(req as Req, res as ServerResponse),
            customProps: (req) => {
              const user = (req as Req).user;
              return user ? { userId: user.id } : {};
            },
            customLogLevel: (_req, res, error) => {
              if (error || res.statusCode >= 500) {
                return 'error';
              }
              return res.statusCode >= 400 ? 'warn' : 'info';
            },
            customSuccessMessage: (req, res) =>
              `${req.method} ${pathOf(req.url)} ${res.statusCode}`,
            customErrorMessage: (req, res) => `${req.method} ${pathOf(req.url)} ${res.statusCode}`,
            autoLogging: { ignore: (req) => isUnlogged((req as Req).url) },
            // pino-http hands custom serializers the output of its standard ones, not the raw objects.
            serializers: {
              req: (req: SerializedReq) => ({
                id: req.id,
                method: req.method,
                url: req.url,
                userAgent: req.headers?.['user-agent'],
                ip: req.remoteAddress,
              }),
              res: (res: SerializedRes) => ({ statusCode: res.statusCode }),
            },
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
