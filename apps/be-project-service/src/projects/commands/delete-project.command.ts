import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { ProjectsRepository } from '../projects.repository';

export class DeleteProjectCommand extends Command<void> {
  constructor(
    readonly id: string,
    readonly userId: string,
  ) {
    super();
  }
}

@CommandHandler(DeleteProjectCommand)
export class DeleteProjectHandler implements ICommandHandler<DeleteProjectCommand, void> {
  constructor(private readonly projects: ProjectsRepository) {}

  async execute(command: DeleteProjectCommand): Promise<void> {
    const deleted = await this.projects.softDelete(command.id, command.userId);

    if (!deleted) {
      throw new NotFoundException('Project not found');
    }
  }
}
