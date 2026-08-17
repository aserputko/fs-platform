import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let service: UsersService;

  const user = {
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: 'argon2-hash',
    displayName: 'Ada Lovelace',
    role: 'USER',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('getProfile', () => {
    it('returns the profile without the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.getProfile('user-1')).resolves.toEqual({
        id: 'user-1',
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        role: 'USER',
        createdAt: user.createdAt,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('omits internal fields', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const profile = await service.getProfile('user-1');

      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile).not.toHaveProperty('isActive');
      expect(profile).not.toHaveProperty('updatedAt');
    });

    it('throws when the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
