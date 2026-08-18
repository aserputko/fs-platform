import { NotFoundException } from '@nestjs/common';
import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import type { ProjectDto } from '../dto/project.dto';
import { ProjectsRepository } from '../projects.repository';

export class GetProjectQuery extends Query<ProjectDto> {
  constructor(
    readonly id: string,
    readonly userId: string,
  ) {
    super();
  }
}

@QueryHandler(GetProjectQuery)
export class GetProjectHandler implements IQueryHandler<GetProjectQuery, ProjectDto> {
  constructor(private readonly projects: ProjectsRepository) {}

  async execute({ id, userId }: GetProjectQuery): Promise<ProjectDto> {
    const project = await this.projects.findOwned(id, userId);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }
}
