import type { PrismaService } from '../prisma/prisma.service';
import { NewProject, ProjectPatch } from './domain/project.model';
import { ProjectsRepository } from './projects.repository';

describe('ProjectsRepository', () => {
  let prisma: {
    project: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let repository: ProjectsRepository;

  const record = {
    id: 'project-1',
    userId: 'user-1',
    title: 'Apollo',
    description: 'Moon landing',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      project: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new ProjectsRepository(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('persists the validated project and projects the response shape', async () => {
      prisma.project.create.mockResolvedValue(record);

      const project = NewProject.create({
        userId: 'user-1',
        title: 'Apollo',
        description: 'Moon landing',
      });

      await expect(repository.create(project)).resolves.toEqual(record);

      const [{ data, select }] = prisma.project.create.mock.calls[0] as [
        { data: Record<string, unknown>; select: Record<string, true> },
      ];

      expect(data).toEqual({ userId: 'user-1', title: 'Apollo', description: 'Moon landing' });
      expect(select).toEqual({
        id: true,
        userId: true,
        title: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      });
      expect(select).not.toHaveProperty('deletedAt');
    });
  });

  describe('findOwned', () => {
    it('scopes the lookup by owner and excludes soft-deleted rows', async () => {
      prisma.project.findFirst.mockResolvedValue(record);

      await repository.findOwned('project-1', 'user-1');

      const [{ where }] = prisma.project.findFirst.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];

      expect(where).toEqual({ id: 'project-1', userId: 'user-1', deletedAt: null });
    });

    it('returns null when nothing matches', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(repository.findOwned('project-1', 'user-2')).resolves.toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.$transaction.mockResolvedValue([[record], 1]);
    });

    it('translates page and limit into skip and take', async () => {
      await expect(repository.list('user-1', { page: 3, limit: 20 })).resolves.toEqual({
        data: [record],
        total: 1,
      });

      const [{ where, skip, take }] = prisma.project.findMany.mock.calls[0] as [
        { where: Record<string, unknown>; skip: number; take: number },
      ];

      expect(where).toEqual({ userId: 'user-1', deletedAt: null });
      expect(skip).toBe(40);
      expect(take).toBe(20);
    });

    it('adds a case-insensitive title filter when searching', async () => {
      await repository.list('user-1', { page: 1, limit: 20, search: 'apo' });

      const [{ where }] = prisma.project.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];

      expect(where).toEqual({
        userId: 'user-1',
        deletedAt: null,
        title: { contains: 'apo', mode: 'insensitive' },
      });
    });

    it('counts with the same filter it queries with', async () => {
      await repository.list('user-1', { page: 1, limit: 20, search: 'apo' });

      const [findArgs] = prisma.project.findMany.mock.calls[0] as [{ where: unknown }];
      const [countArgs] = prisma.project.count.mock.calls[0] as [{ where: unknown }];

      expect(countArgs.where).toEqual(findArgs.where);
    });
  });

  describe('update', () => {
    it('returns null without re-reading when nothing matched', async () => {
      prisma.project.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.update('project-1', 'user-2', ProjectPatch.create({ title: 'Renamed' })),
      ).resolves.toBeNull();
      expect(prisma.project.findFirst).not.toHaveBeenCalled();
    });

    it('omits fields the patch left undefined', async () => {
      prisma.project.updateMany.mockResolvedValue({ count: 1 });
      prisma.project.findFirst.mockResolvedValue(record);

      await repository.update('project-1', 'user-1', ProjectPatch.create({ title: 'Renamed' }));

      const [{ where, data }] = prisma.project.updateMany.mock.calls[0] as [
        { where: Record<string, unknown>; data: Record<string, unknown> },
      ];

      expect(where).toEqual({ id: 'project-1', userId: 'user-1', deletedAt: null });
      expect(data).toEqual({ title: 'Renamed' });
    });

    it('writes an explicit null when the description is cleared', async () => {
      prisma.project.updateMany.mockResolvedValue({ count: 1 });
      prisma.project.findFirst.mockResolvedValue(record);

      await repository.update('project-1', 'user-1', ProjectPatch.create({ description: null }));

      const [{ data }] = prisma.project.updateMany.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];

      expect(data).toEqual({ description: null });
    });
  });

  describe('softDelete', () => {
    it('stamps deletedAt and reports success', async () => {
      prisma.project.updateMany.mockResolvedValue({ count: 1 });

      await expect(repository.softDelete('project-1', 'user-1')).resolves.toBe(true);

      const [{ where, data }] = prisma.project.updateMany.mock.calls[0] as [
        { where: Record<string, unknown>; data: { deletedAt: Date } },
      ];

      expect(where).toEqual({ id: 'project-1', userId: 'user-1', deletedAt: null });
      expect(data.deletedAt).toBeInstanceOf(Date);
    });

    it('reports failure when the row is missing or already deleted', async () => {
      prisma.project.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.softDelete('project-1', 'user-1')).resolves.toBe(false);
    });
  });
});
