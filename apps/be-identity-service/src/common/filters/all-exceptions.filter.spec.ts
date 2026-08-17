import { BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

import { DomainValidationError } from '../errors/domain-validation.error';
import { AllExceptionsFilter, type ErrorResponseBody } from './all-exceptions.filter';
import { DomainValidationFilter } from './domain-validation.filter';

const REQUEST = { id: 'req-1', method: 'POST', url: '/auth/login' };
const RESPONSE = Symbol('response');

function createHost(): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => REQUEST, getResponse: () => RESPONSE }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let reply: jest.Mock;
  let adapterHost: HttpAdapterHost;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  function lastBody(): ErrorResponseBody {
    return reply.mock.calls[0][1] as ErrorResponseBody;
  }

  beforeEach(() => {
    reply = jest.fn();
    adapterHost = {
      httpAdapter: { reply, getRequestUrl: (req: { url: string }) => req.url },
    } as unknown as HttpAdapterHost;

    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('answers client errors with the exception message and logs them as warn', () => {
    new AllExceptionsFilter(adapterHost).catch(
      new UnauthorizedException('Invalid credentials'),
      createHost(),
    );

    expect(lastBody()).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid credentials',
      requestId: 'req-1',
      path: '/auth/login',
    });
    expect(reply).toHaveBeenCalledWith(RESPONSE, expect.anything(), 401);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, reason: 'Invalid credentials' }),
      expect.any(String),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('keeps the validation pipe list of messages', () => {
    new AllExceptionsFilter(adapterHost).catch(
      new BadRequestException(['email must be an email']),
      createHost(),
    );

    expect(lastBody().message).toEqual(['email must be an email']);
  });

  it('hides internal failures from the caller and logs them as error with the cause', () => {
    const cause = new Error('connection terminated unexpectedly');

    new AllExceptionsFilter(adapterHost).catch(cause, createHost());

    expect(lastBody()).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ err: cause, statusCode: 500 }),
      expect.any(String),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('maps a domain validation error to a logged 400', () => {
    new DomainValidationFilter(adapterHost).catch(
      new DomainValidationError('Email is invalid'),
      createHost(),
    );

    expect(lastBody()).toMatchObject({ statusCode: 400, message: 'Email is invalid' });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, reason: 'Email is invalid' }),
      expect.any(String),
    );
  });
});
