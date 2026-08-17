import { Module } from '@nestjs/common';

import { CreateUserHandler } from './commands/create-user.command';
import { FindUserByEmailHandler } from './queries/find-user-by-email.query';
import { FindUserByIdHandler } from './queries/find-user-by-id.query';
import { GetUserProfileHandler } from './queries/get-user-profile.query';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [
    UsersRepository,
    CreateUserHandler,
    FindUserByEmailHandler,
    FindUserByIdHandler,
    GetUserProfileHandler,
  ],
})
export class UsersModule {}
