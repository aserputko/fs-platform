import { NewUser, User, normalizeEmail } from './domain/user.model';
import { UsersRepository } from './users.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('UsersRepository', () => {
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let repository: UsersRepository;

  const record = {
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
    displayName: 'Ada Lovelace',
    role: 'USER' as const,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    repository = new UsersRepository(prisma as unknown as PrismaService);
  });

  describe('findProfile', () => {
    it('never selects the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await repository.findProfile('user-1');

      const [{ select }] = prisma.user.findUnique.mock.calls[0] as [
        { select: Record<string, true> },
      ];

      expect(select).toEqual({
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      });
      expect(select).not.toHaveProperty('passwordHash');
    });

    it('returns null when the user is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(repository.findProfile('missing')).resolves.toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('looks up the normalized email and maps to the domain entity', async () => {
      prisma.user.findUnique.mockResolvedValue(record);

      const user = await repository.findByEmail('  Ada@Example.COM ');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: normalizeEmail('Ada@Example.com') },
      });
      expect(user).toBeInstanceOf(User);
      expect(user?.passwordHash).toBe(record.passwordHash);
    });

    it('returns null when the user is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(repository.findByEmail('nobody@example.com')).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('persists the validated fields and maps the result', async () => {
      prisma.user.create.mockResolvedValue(record);

      const user = await repository.create(
        NewUser.create({ email: 'Ada@Example.com', passwordHash: record.passwordHash }),
      );

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'ada@example.com',
          passwordHash: record.passwordHash,
          displayName: undefined,
        },
      });
      expect(user.id).toBe('user-1');
    });
  });
});
