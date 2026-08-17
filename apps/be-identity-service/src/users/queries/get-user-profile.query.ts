import { NotFoundException } from '@nestjs/common';
import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import type { UserDto } from '../dto/user.dto';
import { UsersRepository } from '../users.repository';

export class GetUserProfileQuery extends Query<UserDto> {
  constructor(readonly userId: string) {
    super();
  }
}

@QueryHandler(GetUserProfileQuery)
export class GetUserProfileHandler implements IQueryHandler<GetUserProfileQuery, UserDto> {
  constructor(private readonly users: UsersRepository) {}

  async execute({ userId }: GetUserProfileQuery): Promise<UserDto> {
    const profile = await this.users.findProfile(userId);

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    return profile;
  }
}
