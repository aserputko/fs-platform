import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import { DomainValidationError } from '../errors/domain-validation.error';

@Catch(DomainValidationError)
export class DomainValidationFilter extends BaseExceptionFilter {
  override catch(error: DomainValidationError, host: ArgumentsHost): void {
    super.catch(new BadRequestException(error.message), host);
  }
}
