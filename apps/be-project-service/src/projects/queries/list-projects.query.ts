import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import type { PaginatedProjectsDto } from '../dto/paginated-projects.dto';
import { ProjectsRepository } from '../projects.repository';

export class ListProjectsQuery extends Query<PaginatedProjectsDto> {
  constructor(
    readonly userId: string,
    readonly page: number,
    readonly limit: number,
    readonly search?: string,
  ) {
    super();
  }
}

@QueryHandler(ListProjectsQuery)
export class ListProjectsHandler implements IQueryHandler<ListProjectsQuery, PaginatedProjectsDto> {
  constructor(private readonly projects: ProjectsRepository) {}

  async execute({ userId, page, limit, search }: ListProjectsQuery): Promise<PaginatedProjectsDto> {
    const { data, total } = await this.projects.list(userId, { page, limit, search });

    return { data, total, page, limit };
  }
}
