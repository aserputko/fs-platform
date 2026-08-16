import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import type { Env } from '../config/env';
import { KeyService } from '../keys/key.service';
import { KeysModule } from '../keys/keys.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [
    KeysModule,
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [KeysModule],
      inject: [KeyService, ConfigService],
      useFactory: (keyService: KeyService, config: ConfigService<Env, true>) => ({
        privateKey: keyService.getSigningKeyPem(),
        signOptions: {
          algorithm: 'RS256' as const,
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
          issuer: config.get('JWT_ISSUER', { infer: true }),
          audience: config.get('JWT_AUDIENCE', { infer: true }),
          keyid: keyService.getSigningKid(),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy, LocalStrategy],
})
export class AuthModule {}
