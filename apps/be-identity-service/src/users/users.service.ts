import { Injectable } from '@nestjs/common';

import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: { email: string; passwordHash: string; displayName?: string }): Promise<User> {
    return this.prisma.user.create({
      data: { ...input, email: normalizeEmail(input.email) },
    });
  }
}

/** Case-insensitive matching prevents two accounts differing only by capitalisation. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
