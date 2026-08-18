import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { NewProject, ProjectPatch } from './domain/project.model';
import type { ProjectDto } from './dto/project.dto';

// Explicit whitelist: the response shape can never drift by accident when a column is added.
const PROJECT_SELECT = {
  id: true,
  userId: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface ListProjectsOptions {
  page: number;
  limit: number;
  search?: string;
}

export interface ProjectPage {
  data: ProjectDto[];
  total: number;
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(project: NewProject): Promise<ProjectDto> {
    return this.prisma.project.create({
      data: {
        userId: project.userId,
        title: project.title,
        description: project.description,
      },
      select: PROJECT_SELECT,
    });
  }

  findOwned(id: string, userId: string): Promise<ProjectDto | null> {
    return this.prisma.project.findFirst({
      where: { id, userId, deletedAt: null },
      select: PROJECT_SELECT,
    });
  }

  async list(userId: string, options: ListProjectsOptions): Promise<ProjectPage> {
    const where = {
      userId,
      deletedAt: null,
      ...(options.search
        ? { title: { contains: options.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        select: PROJECT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return { data, total };
  }

  /** Scoping the update by userId means another user's project is indistinguishable from a missing one. */
  async update(id: string, userId: string, patch: ProjectPatch): Promise<ProjectDto | null> {
    const { count } = await this.prisma.project.updateMany({
      where: { id, userId, deletedAt: null },
      data: {
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.description === undefined ? {} : { description: patch.description }),
      },
    });

    return count === 0 ? null : this.findOwned(id, userId);
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.project.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return count > 0;
  }
}
