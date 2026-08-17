import { NotFoundException } from '@nestjs/common';

import { User } from '../domain/user.model';
import type { UsersRepository } from '../users.repository';
import { GetUserProfileHandler, GetUserProfileQuery } from './get-user-profile.query';

describe('GetUserProfileHandler', () => {
  let users: { findById: jest.Mock };
  let handler: GetUserProfileHandler;

  const user = User.fromPersistence({
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
    displayName: 'Ada Lovelace',
    role: 'USER',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  beforeEach(() => {
    users = { findById: jest.fn() };
    handler = new GetUserProfileHandler(users as unknown as UsersRepository);
  });

  it('returns the profile without the password hash', async () => {
    users.findById.mockResolvedValue(user);

    await expect(handler.execute(new GetUserProfileQuery('user-1'))).resolves.toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      role: 'USER',
      createdAt: user.createdAt,
    });

    expect(users.findById).toHaveBeenCalledWith('user-1');
  });

  it('throws when the user no longer exists', async () => {
    users.findById.mockResolvedValue(null);

    await expect(handler.execute(new GetUserProfileQuery('missing'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
