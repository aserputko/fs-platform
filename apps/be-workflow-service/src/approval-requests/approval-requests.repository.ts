import { ConflictException, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertValidAllowedActions } from '../workflow-definitions/domain/workflow-definition.model';
import { ApprovalChain, type TransitionResult } from './domain/approval-chain.model';
import type { NewApprovalRequest } from './domain/approval-request.model';

/** Whitelist for list responses; `version` and internals never leave the service. */
const SUMMARY_SELECT = {
  id: true,
  subject: true,
  description: true,
  status: true,
  requestorUserId: true,
  currentStepIndex: true,
  definitionKey: true,
  sourceType: true,
  sourceId: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
} as const;

/** Step ids come back so the tasks can be attached in the same transaction. */
const CREATE_SELECT = {
  ...SUMMARY_SELECT,
  steps: { select: { id: true, index: true } },
} as const;

export interface ListOptions {
  skip: number;
  take: number;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  sortBy: 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
}

@Injectable()
export class ApprovalRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the request, its snapshot steps, its tasks and the SUBMITTED entry as one unit. */
  async create(request: NewApprovalRequest) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.approvalRequest.create({
        data: {
          definitionId: request.definitionId,
          definitionKey: request.definitionKey,
          subject: request.subject,
          description: request.description,
          requestorUserId: request.requestorUserId,
          currentStepIndex: request.currentStepIndex,
          sourceType: request.sourceType,
          sourceId: request.sourceId,
          createdVia: request.createdVia,
          createdByService: request.createdByService,
          steps: {
            create: request.steps.map((step) => ({
              index: step.index,
              name: step.name,
              stepType: step.stepType,
              allowedActions: step.allowedActions as unknown as Prisma.InputJsonValue,
              status: step.status,
              completedAt: step.status === 'COMPLETED' ? now : null,
              completedByUserId: step.status === 'COMPLETED' ? request.requestorUserId : null,
            })),
          },
          history: {
            create: {
              stepIndex: 0,
              eventType: 'SUBMIT',
              actorUserId: request.requestorUserId,
              actorRole: 'REQUESTOR',
              fromStatus: 'PENDING',
              toStatus: 'PENDING',
            },
          },
        },
        select: CREATE_SELECT,
      });

      // Tasks carry both requestId and stepId, which a nested create cannot supply at once.
      const stepIdByIndex = new Map(created.steps.map((step) => [step.index, step.id]));
      await tx.approvalTask.createMany({
        data: request.steps.flatMap((step) =>
          step.approverUserIds.map((approverUserId) => ({
            requestId: created.id,
            stepId: stepIdByIndex.get(step.index) as string,
            approverUserId,
          })),
        ),
      });

      const { steps: _steps, ...summary } = created;
      return summary;
    });
  }

  async findChain(id: string): Promise<ApprovalChain | null> {
    const record = await this.prisma.approvalRequest.findUnique({
      where: { id },
      select: {
        id: true,
        requestorUserId: true,
        status: true,
        currentStepIndex: true,
        version: true,
        steps: {
          select: { id: true, index: true, stepType: true, allowedActions: true, status: true },
        },
        tasks: { select: { id: true, stepId: true, approverUserId: true, status: true } },
      },
    });

    if (!record) {
      return null;
    }

    return ApprovalChain.fromProps({
      ...record,
      steps: record.steps.map((step) => ({
        ...step,
        allowedActions: assertValidAllowedActions(step.allowedActions, `Step ${step.index}`),
      })),
    });
  }

  /**
   * Applies a transition under an optimistic lock. Two approvers racing on the same step both
   * read the same `version`, so exactly one `updateMany` matches and the loser gets a 409.
   */
  async applyTransition(result: TransitionResult): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.approvalRequest.updateMany({
        where: { id: result.requestId, version: result.expectedVersion },
        data: {
          status: result.status,
          currentStepIndex: result.currentStepIndex,
          closedAt: result.closedAt,
          version: { increment: 1 },
        },
      });

      if (count === 0) {
        throw new ConflictException('Request was modified concurrently');
      }

      for (const task of result.taskUpdates) {
        await tx.approvalTask.update({
          where: { id: task.taskId },
          data: { status: task.status, actedAt: task.actedAt },
        });
      }

      for (const step of result.stepUpdates) {
        await tx.approvalStep.update({
          where: { id: step.stepId },
          data: {
            status: step.status,
            completedAt: step.completedAt,
            completedByUserId: step.completedByUserId,
          },
        });
      }

      await tx.approvalHistoryEntry.createMany({
        data: result.history.map((entry) => ({ requestId: result.requestId, ...entry })),
      });
    });
  }

  /** Includes `allowedActions` so the caller's available actions come from the same round trip. */
  findDetails(id: string) {
    return this.prisma.approvalRequest.findUnique({
      where: { id },
      select: {
        ...SUMMARY_SELECT,
        version: true,
        steps: {
          orderBy: { index: 'asc' as const },
          select: {
            id: true,
            index: true,
            name: true,
            stepType: true,
            status: true,
            allowedActions: true,
            completedAt: true,
            completedByUserId: true,
            tasks: {
              select: { id: true, stepId: true, approverUserId: true, status: true, actedAt: true },
            },
          },
        },
        history: {
          orderBy: { createdAt: 'asc' as const },
          select: {
            id: true,
            stepIndex: true,
            eventType: true,
            actorUserId: true,
            actorRole: true,
            comment: true,
            fromStatus: true,
            toStatus: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /** Inbox: a single-table lookup on the materialized tasks, which is why they exist. */
  async listInbox(approverUserId: string, options: ListOptions) {
    const where = {
      tasks: { some: { approverUserId, status: 'PENDING' as const } },
      ...(options.status ? { status: options.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.approvalRequest.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: { [options.sortBy]: options.sortOrder },
        skip: options.skip,
        take: options.take,
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return { data, total };
  }

  async listOutbox(requestorUserId: string, options: ListOptions) {
    const where = {
      requestorUserId,
      ...(options.status ? { status: options.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.approvalRequest.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: { [options.sortBy]: options.sortOrder },
        skip: options.skip,
        take: options.take,
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return { data, total };
  }

  findBySource(sourceType: string, sourceId: string) {
    return this.prisma.approvalRequest.findMany({
      where: { sourceType, sourceId },
      select: SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }
}
