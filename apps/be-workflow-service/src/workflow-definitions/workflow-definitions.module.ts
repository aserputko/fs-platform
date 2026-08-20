import { Module } from '@nestjs/common';

import { FindDefinitionByKeyHandler } from './queries/find-definition-by-key.query';
import { WorkflowDefinitionsRepository } from './workflow-definitions.repository';

/** Definitions are seeded, so this module is read-only and has no HTTP surface. */
@Module({
  providers: [WorkflowDefinitionsRepository, FindDefinitionByKeyHandler],
})
export class WorkflowDefinitionsModule {}
