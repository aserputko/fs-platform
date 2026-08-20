import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import { UserDirectoryService } from '../../user-directory/user-directory.service';
import { ApprovalRequestsRepository, type ListOptions } from '../approval-requests.repository';
import type { ApprovalRequestSummaryDto } from '../dto/approval-request-summary.dto';
import {
  DEFAULT_PAGE_SIZE,
  type ListApprovalRequestsQueryDto,
  type PaginatedApprovalRequestsDto,
} from '../dto/list-approval-requests.query.dto';

export type InboxScope = 'inbox' | 'outbox';

export class ListApprovalRequestsQuery extends Query<PaginatedApprovalRequestsDto> {
  constructor(
    readonly scope: InboxScope,
    readonly userId: string,
    readonly filters: ListApprovalRequestsQueryDto,
    /** The caller's own token, forwarded to identity for display names. Never logged. */
    readonly bearerToken?: string,
  ) {
    super();
  }
}

@QueryHandler(ListApprovalRequestsQuery)
export class ListApprovalRequestsHandler implements IQueryHandler<
  ListApprovalRequestsQuery,
  PaginatedApprovalRequestsDto
> {
  constructor(
    private readonly requests: ApprovalRequestsRepository,
    private readonly users: UserDirectoryService,
  ) {}

  async execute({
    scope,
    userId,
    filters,
    bearerToken,
  }: ListApprovalRequestsQuery): Promise<PaginatedApprovalRequestsDto> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? DEFAULT_PAGE_SIZE;

    const options: ListOptions = {
      skip: (page - 1) * limit,
      take: limit,
      status: filters.status,
      sortBy: filters.sortBy ?? 'createdAt',
      sortOrder: filters.sortOrder ?? 'desc',
    };

    const { data, total } =
      scope === 'inbox'
        ? await this.requests.listInbox(userId, options)
        : await this.requests.listOutbox(userId, options);

    const names = await this.users.resolve(
      data.map((request) => request.requestorUserId),
      bearerToken,
    );

    const summaries: ApprovalRequestSummaryDto[] = data.map((request) => ({
      ...request,
      requestorDisplayName: names.get(request.requestorUserId) ?? null,
    }));

    return { data: summaries, total, page, limit };
  }
}
