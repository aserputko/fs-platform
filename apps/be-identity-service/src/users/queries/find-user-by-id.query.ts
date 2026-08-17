import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import type { User } from '../domain/user.model';
import { UsersRepository } from '../users.repository';

export class FindUserByIdQuery extends Query<User | null> {
  constructor(readonly userId: string) {
    super();
  }
}

@QueryHandler(FindUserByIdQuery)
export class FindUserByIdHandler implements IQueryHandler<FindUserByIdQuery, User | null> {
  constructor(private readonly users: UsersRepository) {}

  execute({ userId }: FindUserByIdQuery): Promise<User | null> {
    return this.users.findById(userId);
  }
}
