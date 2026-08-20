import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../config/env';
import { KeyService } from '../../keys/key.service';
import { readKid } from '../read-kid';
import type { ServicePrincipal, ServiceTokenPayload } from '../service-principal';

/**
 * Verifies tokens minted by executor services with the service-only key pair. A user token cannot
 * pass here: it is signed with a different key and carries a different audience.
 */
@Injectable()
export class ServiceJwtStrategy extends PassportStrategy(Strategy, 'service-jwt') {
  private readonly allowedIssuers: string[];

  constructor(config: ConfigService<Env, true>, keyService: KeyService) {
    const allowedIssuers = config.get('SERVICE_JWT_ISSUERS', { infer: true });

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer: allowedIssuers,
      audience: config.get('SERVICE_JWT_AUDIENCE', { infer: true }),
      secretOrKeyProvider: (
        _request: unknown,
        rawJwtToken: string,
        done: (err: Error | null, key?: string) => void,
      ) => {
        const pem = keyService.getServiceVerificationKeyPem(readKid(rawJwtToken));

        if (!pem) {
          done(new UnauthorizedException('Service token signed with an unknown key'));
          return;
        }

        done(null, pem);
      },
    });

    this.allowedIssuers = allowedIssuers;
  }

  validate(payload: ServiceTokenPayload): ServicePrincipal {
    if (!payload.sub || !this.allowedIssuers.includes(payload.iss)) {
      throw new UnauthorizedException('Service token is not from a known service');
    }

    return { serviceId: payload.sub };
  }
}
