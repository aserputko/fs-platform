import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { NewUser, User } from '../domain/user.model';
import { UsersRepository } from '../users.repository';

export class CreateUserCommand extends Command<User> {
  constructor(
    readonly email: string,
    readonly passwordHash: string,
    readonly displayName?: string,
  ) {
    super();
  }
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, User> {
  constructor(private readonly users: UsersRepository) {}

  execute(command: CreateUserCommand): Promise<User> {
    const newUser = NewUser.create({
      email: command.email,
      passwordHash: command.passwordHash,
      displayName: command.displayName,
    });

    return this.users.create(newUser);
  }
}
