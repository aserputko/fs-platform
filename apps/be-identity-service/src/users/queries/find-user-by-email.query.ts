import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import type { User } from '../domain/user.model';
import { UsersRepository } from '../users.repository';

export class FindUserByEmailQuery extends Query<User | null> {
  constructor(readonly email: string) {
    super();
  }
}

@QueryHandler(FindUserByEmailQuery)
export class FindUserByEmailHandler implements IQueryHandler<FindUserByEmailQuery, User | null> {
  constructor(private readonly users: UsersRepository) {}

  execute({ email }: FindUserByEmailQuery): Promise<User | null> {
    return this.users.findByEmail(email);
  }
}
