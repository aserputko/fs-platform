import { Module } from '@nestjs/common';

import { CreateProjectHandler } from './commands/create-project.command';
import { DeleteProjectHandler } from './commands/delete-project.command';
import { UpdateProjectHandler } from './commands/update-project.command';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { GetProjectHandler } from './queries/get-project.query';
import { ListProjectsHandler } from './queries/list-projects.query';

@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectsRepository,
    CreateProjectHandler,
    UpdateProjectHandler,
    DeleteProjectHandler,
    GetProjectHandler,
    ListProjectsHandler,
  ],
})
export class ProjectsModule {}
