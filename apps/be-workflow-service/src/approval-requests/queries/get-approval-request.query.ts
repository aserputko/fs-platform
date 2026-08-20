import { NotFoundException } from '@nestjs/common';
import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import { UserDirectoryService } from '../../user-directory/user-directory.service';
import { assertValidAllowedActions } from '../../workflow-definitions/domain/workflow-definition.model';
import { ApprovalRequestsRepository } from '../approval-requests.repository';
import { ApprovalChain } from '../domain/approval-chain.model';
import type { ApprovalRequestDetailsDto } from '../dto/approval-request-details.dto';

export class GetApprovalRequestQuery extends Query<ApprovalRequestDetailsDto> {
  constructor(
    readonly id: string,
    readonly userId: string,
    /** The caller's own token, forwarded to identity for display names. Never logged. */
    readonly bearerToken?: string,
  ) {
    super();
  }
}

@QueryHandler(GetApprovalRequestQuery)
export class GetApprovalRequestHandler implements IQueryHandler<
  GetApprovalRequestQuery,
  ApprovalRequestDetailsDto
> {
  constructor(
    private readonly requests: ApprovalRequestsRepository,
    private readonly users: UserDirectoryService,
  ) {}

  async execute({
    id,
    userId,
    bearerToken,
  }: GetApprovalRequestQuery): Promise<ApprovalRequestDetailsDto> {
    const record = await this.requests.findDetails(id);

    if (!record) {
      throw new NotFoundException('Approval request not found');
    }

    const chain = ApprovalChain.fromProps({
      id: record.id,
      requestorUserId: record.requestorUserId,
      status: record.status,
      currentStepIndex: record.currentStepIndex,
      version: record.version,
      steps: record.steps.map((step) => ({
        id: step.id,
        index: step.index,
        stepType: step.stepType,
        status: step.status,
        allowedActions: assertValidAllowedActions(step.allowedActions, `Step ${step.index}`),
      })),
      tasks: record.steps.flatMap((step) => step.tasks),
    });

    // A stranger must not be able to distinguish "forbidden" from "does not exist".
    if (!chain.canBeReadBy(userId)) {
      throw new NotFoundException('Approval request not found');
    }

    const names = await this.users.resolve(
      [
        record.requestorUserId,
        ...record.steps.flatMap((step) => step.tasks.map((task) => task.approverUserId)),
        ...record.history.flatMap((entry) => (entry.actorUserId ? [entry.actorUserId] : [])),
      ],
      bearerToken,
    );

    return {
      id: record.id,
      subject: record.subject,
      description: record.description,
      status: record.status,
      requestorUserId: record.requestorUserId,
      requestorDisplayName: names.get(record.requestorUserId) ?? null,
      currentStepIndex: record.currentStepIndex,
      definitionKey: record.definitionKey,
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      closedAt: record.closedAt,
      chain: record.steps.map((step) => ({
        id: step.id,
        index: step.index,
        name: step.name,
        stepType: step.stepType,
        status: step.status,
        completedAt: step.completedAt,
        completedByUserId: step.completedByUserId,
        approvers: step.tasks.map((task) => ({
          id: task.id,
          approverUserId: task.approverUserId,
          approverDisplayName: names.get(task.approverUserId) ?? null,
          status: task.status,
          actedAt: task.actedAt,
        })),
      })),
      history: record.history.map((entry) => ({
        id: entry.id,
        stepIndex: entry.stepIndex,
        eventType: entry.eventType,
        actorUserId: entry.actorUserId,
        actorDisplayName: entry.actorUserId ? (names.get(entry.actorUserId) ?? null) : null,
        actorRole: entry.actorRole,
        comment: entry.comment,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        createdAt: entry.createdAt,
      })),
      availableActions: chain.availableActionsFor(userId),
    };
  }
}
