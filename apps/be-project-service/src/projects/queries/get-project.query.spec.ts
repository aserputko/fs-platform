import { NotFoundException } from '@nestjs/common';

import type { ProjectDto } from '../dto/project.dto';
import type { ProjectsRepository } from '../projects.repository';
import { GetProjectHandler, GetProjectQuery } from './get-project.query';

describe('GetProjectHandler', () => {
  const dto: ProjectDto = {
    id: 'project-1',
    userId: 'user-1',
    title: 'Apollo',
    description: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  let projects: { findOwned: jest.Mock };
  let handler: GetProjectHandler;

  beforeEach(() => {
    projects = { findOwned: jest.fn() };
    handler = new GetProjectHandler(projects as unknown as ProjectsRepository);
  });

  it('returns the project scoped to its owner', async () => {
    projects.findOwned.mockResolvedValue(dto);

    await expect(handler.execute(new GetProjectQuery('project-1', 'user-1'))).resolves.toEqual(dto);
    expect(projects.findOwned).toHaveBeenCalledWith('project-1', 'user-1');
  });

  it('reports another user\u2019s project as missing rather than forbidden', async () => {
    projects.findOwned.mockResolvedValue(null);

    await expect(
      handler.execute(new GetProjectQuery('project-1', 'user-2')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
