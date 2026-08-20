import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// CANCEL sits on the first approver step, not the requestor step: an action is only offered
// while its step is the current one, so this is what limits cancelling to "before anyone acted".
const definitions = [
  {
    key: 'generic-approval',
    name: 'Generic approval',
    description: 'Requestor submits, a single approver step decides.',
    steps: [
      {
        index: 0,
        name: 'Requestor',
        stepType: 'REQUESTOR' as const,
        allowedActions: [{ type: 'SUBMIT', commentRequired: false }],
      },
      {
        index: 1,
        name: 'Approval',
        stepType: 'APPROVER' as const,
        allowedActions: [
          { type: 'APPROVE', commentRequired: false },
          { type: 'REJECT', commentRequired: true },
          { type: 'CANCEL', commentRequired: false },
        ],
      },
    ],
  },
  {
    key: 'two-stage-approval',
    name: 'Two-stage approval',
    description: 'Requestor submits, then two sequential approver steps.',
    steps: [
      {
        index: 0,
        name: 'Requestor',
        stepType: 'REQUESTOR' as const,
        allowedActions: [{ type: 'SUBMIT', commentRequired: false }],
      },
      {
        index: 1,
        name: 'First approval',
        stepType: 'APPROVER' as const,
        allowedActions: [
          { type: 'APPROVE', commentRequired: false },
          { type: 'REJECT', commentRequired: true },
          { type: 'CANCEL', commentRequired: false },
        ],
      },
      {
        index: 2,
        name: 'Final approval',
        stepType: 'APPROVER' as const,
        allowedActions: [
          { type: 'APPROVE', commentRequired: false },
          { type: 'REJECT', commentRequired: true },
        ],
      },
    ],
  },
];

async function main(): Promise<void> {
  for (const definition of definitions) {
    const record = await prisma.workflowDefinition.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        name: definition.name,
        description: definition.description,
      },
      update: { name: definition.name, description: definition.description },
    });

    for (const step of definition.steps) {
      await prisma.stepTemplate.upsert({
        where: { definitionId_index: { definitionId: record.id, index: step.index } },
        create: { definitionId: record.id, ...step },
        update: { name: step.name, stepType: step.stepType, allowedActions: step.allowedActions },
      });
    }

    console.log(`Seeded workflow definition "${definition.key}"`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
