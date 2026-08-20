import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { assertValidAllowedActions, WorkflowDefinition } from './domain/workflow-definition.model';

@Injectable()
export class WorkflowDefinitionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(key: string): Promise<WorkflowDefinition | null> {
    const record = await this.prisma.workflowDefinition.findUnique({
      where: { key },
      include: { steps: { orderBy: { index: 'asc' } } },
    });

    if (!record) {
      return null;
    }

    return WorkflowDefinition.fromProps({
      id: record.id,
      key: record.key,
      name: record.name,
      isActive: record.isActive,
      steps: record.steps.map((step) => ({
        index: step.index,
        name: step.name,
        stepType: step.stepType,
        allowedActions: assertValidAllowedActions(
          step.allowedActions,
          `Step ${step.index} of "${record.key}"`,
        ),
      })),
    });
  }
}
