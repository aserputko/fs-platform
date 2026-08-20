import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import { ApprovalRequestsRepository } from '../approval-requests.repository';
import type { ApprovalRequestSummaryDto } from '../dto/approval-request-summary.dto';

export class FindRequestsBySourceQuery extends Query<ApprovalRequestSummaryDto[]> {
  constructor(
    readonly sourceType: string,
    readonly sourceId: string,
  ) {
    super();
  }
}

/** Outcome propagation is pull-based, so this is how an executor learns a decision. */
@QueryHandler(FindRequestsBySourceQuery)
export class FindRequestsBySourceHandler implements IQueryHandler<
  FindRequestsBySourceQuery,
  ApprovalRequestSummaryDto[]
> {
  constructor(private readonly requests: ApprovalRequestsRepository) {}

  async execute({
    sourceType,
    sourceId,
  }: FindRequestsBySourceQuery): Promise<ApprovalRequestSummaryDto[]> {
    const records = await this.requests.findBySource(sourceType, sourceId);

    return records.map((record) => ({ ...record, requestorDisplayName: null }));
  }
}
