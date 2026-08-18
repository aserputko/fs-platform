import { NotFoundException } from '@nestjs/common';

import { DomainValidationError } from '../../common/errors/domain-validation.error';
import type { ProjectDto } from '../dto/project.dto';
import type { ProjectsRepository } from '../projects.repository';
import { UpdateProjectCommand, UpdateProjectHandler } from './update-project.command';

describe('UpdateProjectHandler', () => {
  const dto: ProjectDto = {
    id: 'project-1',
    userId: 'user-1',
    title: 'Renamed',
    description: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  let projects: { update: jest.Mock };
  let handler: UpdateProjectHandler;

  beforeEach(() => {
    projects = { update: jest.fn() };
    handler = new UpdateProjectHandler(projects as unknown as ProjectsRepository);
  });

  it('returns the updated project', async () => {
    projects.update.mockResolvedValue(dto);

    await expect(
      handler.execute(new UpdateProjectCommand('project-1', 'user-1', 'Renamed')),
    ).resolves.toEqual(dto);
  });

  it('reports another user\u2019s project as missing rather than forbidden', async () => {
    projects.update.mockResolvedValue(null);

    await expect(
      handler.execute(new UpdateProjectCommand('project-1', 'user-2', 'Renamed')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a patch with no fields before touching the repository', async () => {
    await expect(
      handler.execute(new UpdateProjectCommand('project-1', 'user-1')),
    ).rejects.toBeInstanceOf(DomainValidationError);
    expect(projects.update).not.toHaveBeenCalled();
  });
});
