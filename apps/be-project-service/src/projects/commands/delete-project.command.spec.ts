import { NotFoundException } from '@nestjs/common';

import type { ProjectsRepository } from '../projects.repository';
import { DeleteProjectCommand, DeleteProjectHandler } from './delete-project.command';

describe('DeleteProjectHandler', () => {
  let projects: { softDelete: jest.Mock };
  let handler: DeleteProjectHandler;

  beforeEach(() => {
    projects = { softDelete: jest.fn() };
    handler = new DeleteProjectHandler(projects as unknown as ProjectsRepository);
  });

  it('resolves when the project was soft-deleted', async () => {
    projects.softDelete.mockResolvedValue(true);

    await expect(
      handler.execute(new DeleteProjectCommand('project-1', 'user-1')),
    ).resolves.toBeUndefined();
    expect(projects.softDelete).toHaveBeenCalledWith('project-1', 'user-1');
  });

  it('reports another user\u2019s project as missing rather than forbidden', async () => {
    projects.softDelete.mockResolvedValue(false);

    await expect(
      handler.execute(new DeleteProjectCommand('project-1', 'user-2')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
