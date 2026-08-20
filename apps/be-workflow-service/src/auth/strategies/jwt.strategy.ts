import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../config/env';
import { KeyService } from '../../keys/key.service';
import type { AccessTokenPayload, AuthenticatedUser } from '../authenticated-user';
import { readKid } from '../read-kid';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>, keyService: KeyService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer: config.get('JWT_ISSUER', { infer: true }),
      audience: config.get('JWT_AUDIENCE', { infer: true }),
      secretOrKeyProvider: (
        _request: unknown,
        rawJwtToken: string,
        done: (err: Error | null, key?: string) => void,
      ) => {
        const pem = keyService.getVerificationKeyPem(readKid(rawJwtToken));

        if (!pem) {
          done(new UnauthorizedException('Token signed with an unknown key'));
          return;
        }

        done(null, pem);
      },
    });
  }

  // There is no local user table, so a token that passes signature, issuer, audience and
  // expiry checks is authoritative about who the caller is.
  validate(payload: AccessTokenPayload): AuthenticatedUser {
    if (!payload.sub) {
      throw new UnauthorizedException('Token is missing a subject claim');
    }

    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
