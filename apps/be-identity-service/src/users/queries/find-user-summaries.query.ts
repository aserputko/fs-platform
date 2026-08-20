import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import type { UserSummaryDto } from '../dto/user-summary.dto';
import { UsersRepository } from '../users.repository';

export class FindUserSummariesQuery extends Query<UserSummaryDto[]> {
  constructor(readonly ids: string[]) {
    super();
  }
}

@QueryHandler(FindUserSummariesQuery)
export class FindUserSummariesHandler implements IQueryHandler<
  FindUserSummariesQuery,
  UserSummaryDto[]
> {
  constructor(private readonly users: UsersRepository) {}

  // Unknown ids are simply absent from the response rather than an error: callers are
  // resolving display names for ids they already hold.
  execute({ ids }: FindUserSummariesQuery): Promise<UserSummaryDto[]> {
    return this.users.findSummaries(ids);
  }
}
