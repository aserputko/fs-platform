import { Injectable } from '@nestjs/common';

import type { User as UserRecord } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NewUser, User, normalizeEmail } from './domain/user.model';
import type { UserDto } from './dto/user.dto';

// The read side never selects passwordHash, so it cannot leak through a profile response.
const PROFILE_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
} as const;

function toDomain(record: UserRecord): User {
  return User.fromProps({
    id: record.id,
    email: record.email,
    passwordHash: record.passwordHash,
    displayName: record.displayName,
    role: record.role,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });

    return record ? toDomain(record) : null;
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });

    return record ? toDomain(record) : null;
  }

  async create(user: NewUser): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        email: user.email,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
      },
    });

    return toDomain(record);
  }

  findProfile(id: string): Promise<UserDto | null> {
    return this.prisma.user.findUnique({ where: { id }, select: PROFILE_SELECT });
  }
}
