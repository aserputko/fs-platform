import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { KeysModule } from '../keys/keys.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ServiceJwtStrategy } from './strategies/service-jwt.strategy';

/** Verification only: user tokens are minted by be-identity-service and service tokens by
 * executor services, never here. The two use separate key pairs and separate audiences. */
@Module({
  imports: [KeysModule, PassportModule],
  providers: [JwtStrategy, ServiceJwtStrategy],
})
export class AuthModule {}
