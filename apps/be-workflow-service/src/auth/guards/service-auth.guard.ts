import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Applied per-route alongside `@Public()`, which is what lets a request past the global
 * user-token guard so this one can require a service token instead.
 */
@Injectable()
export class ServiceAuthGuard extends AuthGuard('service-jwt') {}
