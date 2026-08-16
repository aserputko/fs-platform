import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

const USER = { id: 'user-1', email: 'ada@example.com', role: 'USER' as const };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

describe('TokenService', () => {
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  let service: TokenService;

  beforeEach(() => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.access.token'),
      decode: jest.fn().mockReturnValue({ iat: 1_000, exp: 1_900 }),
    };

    const config = { get: () => 30 } as unknown as ConfigService<Env, true>;
    service = new TokenService(
      jwtService as unknown as JwtService,
      prisma as unknown as PrismaService,
      config,
    );
  });

  it('persists only the hash of the refresh token', async () => {
    const tokens = await service.issueTokens(USER);

    const persisted = prisma.refreshToken.create.mock.calls[0][0].data;

    expect(persisted.tokenHash).toBe(sha256(tokens.refreshToken));
    expect(persisted.tokenHash).not.toBe(tokens.refreshToken);
    expect(persisted.userId).toBe(USER.id);
  });

  it('reports the access token lifetime in seconds', async () => {
    const tokens = await service.issueTokens(USER);

    expect(tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
  });

  it('keeps the rotated token inside the original family', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-1',
      familyId: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...USER, isActive: true },
    });

    await service.rotate('presented-token');

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'token-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create.mock.calls[0][0].data.familyId).toBe('family-1');
  });

  it('revokes the whole family when a used token is replayed', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-1',
      familyId: 'family-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...USER, isActive: true },
    });

    await expect(service.rotate('replayed')).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects an expired refresh token without issuing a new one', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-1',
      familyId: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
      user: { ...USER, isActive: true },
    });

    await expect(service.rotate('expired')).rejects.toThrow(/expired/);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects a refresh token belonging to a disabled account', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-1',
      familyId: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...USER, isActive: false },
    });

    await expect(service.rotate('disabled')).rejects.toThrow(/disabled/);
  });

  it('rejects an unknown refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.rotate('unknown')).rejects.toThrow(UnauthorizedException);
  });
});
