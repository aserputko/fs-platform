import type { ProjectsRepository } from '../projects.repository';
import { ListProjectsHandler, ListProjectsQuery } from './list-projects.query';

describe('ListProjectsHandler', () => {
  let projects: { list: jest.Mock };
  let handler: ListProjectsHandler;

  beforeEach(() => {
    projects = { list: jest.fn() };
    handler = new ListProjectsHandler(projects as unknown as ProjectsRepository);
  });

  it('echoes the requested page and limit alongside the total', async () => {
    projects.list.mockResolvedValue({ data: [], total: 42 });

    await expect(handler.execute(new ListProjectsQuery('user-1', 2, 20, 'apo'))).resolves.toEqual({
      data: [],
      total: 42,
      page: 2,
      limit: 20,
    });
    expect(projects.list).toHaveBeenCalledWith('user-1', { page: 2, limit: 20, search: 'apo' });
  });
});
