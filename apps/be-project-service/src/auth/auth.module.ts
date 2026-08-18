import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { KeysModule } from '../keys/keys.module';
import { JwtStrategy } from './strategies/jwt.strategy';

/** Verification only: tokens are minted by be-identity-service, never here. */
@Module({
  imports: [KeysModule, PassportModule],
  providers: [JwtStrategy],
})
export class AuthModule {}
