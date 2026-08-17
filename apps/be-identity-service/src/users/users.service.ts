import { Injectable, NotFoundException } from '@nestjs/common';

import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UserDto } from './dto/user.dto';

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

  async getProfile(id: string): Promise<UserDto> {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toUserDto(user);
  }
}

/** Case-insensitive matching prevents two accounts differing only by capitalisation. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
  };
}
