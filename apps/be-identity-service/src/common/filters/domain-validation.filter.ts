import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';

import { DomainValidationError } from '../errors/domain-validation.error';
import { AllExceptionsFilter } from './all-exceptions.filter';

@Catch(DomainValidationError)
export class DomainValidationFilter extends AllExceptionsFilter {
  override catch(error: DomainValidationError, host: ArgumentsHost): void {
    super.catch(new BadRequestException(error.message), host);
  }
}
