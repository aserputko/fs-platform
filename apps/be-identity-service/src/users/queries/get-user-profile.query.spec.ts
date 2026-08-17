import { NotFoundException } from '@nestjs/common';

import type { UserDto } from '../dto/user.dto';
import type { UsersRepository } from '../users.repository';
import { GetUserProfileHandler, GetUserProfileQuery } from './get-user-profile.query';

describe('GetUserProfileHandler', () => {
  let users: { findProfile: jest.Mock };
  let handler: GetUserProfileHandler;

  const profile: UserDto = {
    id: 'user-1',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    role: 'USER',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    users = { findProfile: jest.fn() };
    handler = new GetUserProfileHandler(users as unknown as UsersRepository);
  });

  it('returns the projected profile', async () => {
    users.findProfile.mockResolvedValue(profile);

    await expect(handler.execute(new GetUserProfileQuery('user-1'))).resolves.toEqual(profile);
    expect(users.findProfile).toHaveBeenCalledWith('user-1');
  });

  it('throws when the user no longer exists', async () => {
    users.findProfile.mockResolvedValue(null);

    await expect(handler.execute(new GetUserProfileQuery('missing'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
