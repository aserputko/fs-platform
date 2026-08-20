import { ConflictException, NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import type { ActionType } from '../../workflow-definitions/domain/workflow-definition.model';
import { ApprovalRequestsRepository } from '../approval-requests.repository';

export class PerformApprovalActionCommand extends Command<void> {
  constructor(
    readonly requestId: string,
    readonly userId: string,
    readonly actionType: ActionType,
    readonly comment?: string,
  ) {
    super();
  }
}

@CommandHandler(PerformApprovalActionCommand)
export class PerformApprovalActionHandler implements ICommandHandler<
  PerformApprovalActionCommand,
  void
> {
  constructor(private readonly requests: ApprovalRequestsRepository) {}

  async execute({
    requestId,
    userId,
    actionType,
    comment,
  }: PerformApprovalActionCommand): Promise<void> {
    const chain = await this.requests.findChain(requestId);

    // Someone with no part in the chain must not be able to tell it exists.
    if (!chain?.canBeReadBy(userId)) {
      throw new NotFoundException('Approval request not found');
    }

    if (!chain.availableActionsFor(userId).includes(actionType)) {
      throw new ConflictException(`Action ${actionType} is not available on this request`);
    }

    await this.requests.applyTransition(chain.apply(actionType, userId, comment));
  }
}
