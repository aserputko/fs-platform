import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { NewProject } from '../domain/project.model';
import type { ProjectDto } from '../dto/project.dto';
import { ProjectsRepository } from '../projects.repository';

export class CreateProjectCommand extends Command<ProjectDto> {
  constructor(
    readonly userId: string,
    readonly title: string,
    readonly description?: string,
  ) {
    super();
  }
}

@CommandHandler(CreateProjectCommand)
export class CreateProjectHandler implements ICommandHandler<CreateProjectCommand, ProjectDto> {
  constructor(private readonly projects: ProjectsRepository) {}

  execute(command: CreateProjectCommand): Promise<ProjectDto> {
    const project = NewProject.create({
      userId: command.userId,
      title: command.title,
      description: command.description,
    });

    return this.projects.create(project);
  }
}
