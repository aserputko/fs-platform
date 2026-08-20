import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';

import { FindDefinitionByKeyQuery } from '../../workflow-definitions/queries/find-definition-by-key.query';
import { ApprovalRequestsRepository } from '../approval-requests.repository';
import {
  NewApprovalRequest,
  type CreatedVia,
  type StepAssignment,
} from '../domain/approval-request.model';
import type { ApprovalRequestSummaryDto } from '../dto/approval-request-summary.dto';

export class CreateApprovalRequestCommand extends Command<ApprovalRequestSummaryDto> {
  constructor(
    readonly definitionKey: string,
    readonly subject: string,
    readonly description: string,
    readonly requestorUserId: string,
    readonly assignments: StepAssignment[],
    readonly createdVia: CreatedVia,
    readonly sourceType?: string,
    readonly sourceId?: string,
    readonly createdByService?: string,
  ) {
    super();
  }
}

@CommandHandler(CreateApprovalRequestCommand)
export class CreateApprovalRequestHandler implements ICommandHandler<
  CreateApprovalRequestCommand,
  ApprovalRequestSummaryDto
> {
  constructor(
    private readonly requests: ApprovalRequestsRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: CreateApprovalRequestCommand): Promise<ApprovalRequestSummaryDto> {
    const definition = await this.queryBus.execute(
      new FindDefinitionByKeyQuery(command.definitionKey),
    );

    if (!definition) {
      throw new NotFoundException('Workflow definition not found');
    }

    const request = NewApprovalRequest.create({
      definition,
      subject: command.subject,
      description: command.description,
      requestorUserId: command.requestorUserId,
      assignments: command.assignments,
      sourceType: command.sourceType,
      sourceId: command.sourceId,
      createdVia: command.createdVia,
      createdByService: command.createdByService,
    });

    const created = await this.requests.create(request);

    return { ...created, requestorDisplayName: null };
  }
}
