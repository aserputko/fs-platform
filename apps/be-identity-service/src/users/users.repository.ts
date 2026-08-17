import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NewUser, User, normalizeEmail } from './domain/user.model';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });

    return record ? User.fromPersistence(record) : null;
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });

    return record ? User.fromPersistence(record) : null;
  }

  async create(user: NewUser): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        email: user.email,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
      },
    });

    return User.fromPersistence(record);
  }
}
