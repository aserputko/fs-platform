import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import type { WorkflowDefinition } from '../domain/workflow-definition.model';
import { WorkflowDefinitionsRepository } from '../workflow-definitions.repository';

export class FindDefinitionByKeyQuery extends Query<WorkflowDefinition | null> {
  constructor(readonly key: string) {
    super();
  }
}

@QueryHandler(FindDefinitionByKeyQuery)
export class FindDefinitionByKeyHandler implements IQueryHandler<
  FindDefinitionByKeyQuery,
  WorkflowDefinition | null
> {
  constructor(private readonly definitions: WorkflowDefinitionsRepository) {}

  execute({ key }: FindDefinitionByKeyQuery): Promise<WorkflowDefinition | null> {
    return this.definitions.findByKey(key);
  }
}
