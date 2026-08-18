import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { ProjectPatch } from '../domain/project.model';
import type { ProjectDto } from '../dto/project.dto';
import { ProjectsRepository } from '../projects.repository';

export class UpdateProjectCommand extends Command<ProjectDto> {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly title?: string,
    readonly description?: string | null,
  ) {
    super();
  }
}

@CommandHandler(UpdateProjectCommand)
export class UpdateProjectHandler implements ICommandHandler<UpdateProjectCommand, ProjectDto> {
  constructor(private readonly projects: ProjectsRepository) {}

  async execute(command: UpdateProjectCommand): Promise<ProjectDto> {
    const patch = ProjectPatch.create({
      title: command.title,
      description: command.description,
    });

    const project = await this.projects.update(command.id, command.userId, patch);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }
}
