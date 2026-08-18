import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateProjectCommand } from './commands/create-project.command';
import { DeleteProjectCommand } from './commands/delete-project.command';
import { UpdateProjectCommand } from './commands/update-project.command';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects.query.dto';
import { PaginatedProjectsDto } from './dto/paginated-projects.dto';
import { ProjectDto } from './dto/project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { GetProjectQuery } from './queries/get-project.query';
import { ListProjectsQuery } from './queries/list-projects.query';

@ApiTags('projects')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired access token' })
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a project owned by the authenticated user' })
  @ApiCreatedResponse({ type: ProjectDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateProjectDto,
  ): Promise<ProjectDto> {
    return this.commandBus.execute(new CreateProjectCommand(user.id, body.title, body.description));
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated user's projects" })
  @ApiOkResponse({ type: PaginatedProjectsDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProjectsQueryDto,
  ): Promise<PaginatedProjectsDto> {
    return this.queryBus.execute(
      new ListProjectsQuery(user.id, query.page, query.limit, query.search),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return a single project' })
  @ApiOkResponse({ type: ProjectDto })
  @ApiNotFoundResponse({ description: 'Project not found' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectDto> {
    return this.queryBus.execute(new GetProjectQuery(id, user.id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiOkResponse({ type: ProjectDto })
  @ApiNotFoundResponse({ description: 'Project not found' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectDto,
  ): Promise<ProjectDto> {
    return this.commandBus.execute(
      new UpdateProjectCommand(id, user.id, body.title, body.description),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a project' })
  @ApiNoContentResponse({ description: 'Project deleted' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.commandBus.execute(new DeleteProjectCommand(id, user.id));
  }
}
