import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { ServicePrincipal } from '../../auth/service-principal';

export const CurrentService = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ServicePrincipal => {
    const request = ctx.switchToHttp().getRequest<Request & { user: ServicePrincipal }>();
    return request.user;
  },
);
