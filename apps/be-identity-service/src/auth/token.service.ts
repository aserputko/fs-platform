import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './authenticated-user';
import type { TokensDto } from './dto/tokens.dto';

/** Refresh tokens are 256 bits of entropy, so a fast digest is sufficient - unlike passwords. */
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly refreshTtlDays: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.refreshTtlDays = config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
  }

  async issueTokens(user: AuthenticatedUser, familyId: string = randomUUID()): Promise<TokensDto> {
    const accessToken = await this.jwtService.signAsync(
      { email: user.email, role: user.role },
      { subject: user.id },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hashRefreshToken(refreshToken), familyId, expiresAt },
    });

    const decoded = this.jwtService.decode(accessToken) as { iat: number; exp: number };

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: decoded.exp - decoded.iat,
    };
  }

  async rotate(presentedToken: string): Promise<TokensDto> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(presentedToken) },
      include: { user: true },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revokedAt) {
      // The token was already rotated, so this is a replay: burn the whole chain.
      this.logger.warn(`Refresh token reuse detected for family ${record.familyId}`);
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!record.user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const { id, email, role } = record.user;
    return this.issueTokens({ id, email, role }, record.familyId);
  }

  async revokeByToken(presentedToken: string): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(presentedToken) },
      select: { familyId: true },
    });

    if (record) {
      await this.revokeFamily(record.familyId);
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
