import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryBus } from '@nestjs/cqrs';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../config/env';
import { KeyService } from '../../keys/key.service';
import type { User } from '../../users/domain/user.model';
import { FindUserByIdQuery } from '../../users/queries/find-user-by-id.query';
import type { AccessTokenPayload, AuthenticatedUser } from '../authenticated-user';

/** Reads the unverified header purely to select a key; the signature is still checked afterwards. */
function readKid(rawJwt: string): string | undefined {
  const encodedHeader = rawJwt.split('.')[0];
  if (!encodedHeader) {
    return undefined;
  }

  try {
    const header: unknown = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (typeof header === 'object' && header !== null && 'kid' in header) {
      const { kid } = header as { kid?: unknown };
      return typeof kid === 'string' ? kid : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    keyService: KeyService,
    private readonly queryBus: QueryBus,
  ) {
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

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user: User | null = await this.queryBus.execute(new FindUserByIdQuery(payload.sub));

    if (!user?.canAuthenticate()) {
      throw new UnauthorizedException();
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
