import { ConflictException, Injectable, type OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './authenticated-user';
import type { RegisterDto } from './dto/register.dto';
import type { TokensDto } from './dto/tokens.dto';
import { TokenService } from './token.service';

// OWASP Password Storage Cheat Sheet baseline for argon2id.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class AuthService implements OnModuleInit {
  private decoyHash!: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.decoyHash = await argon2.hash(randomBytes(32).toString('hex'), ARGON2_OPTIONS);
  }

  async register(dto: RegisterDto): Promise<TokensDto> {
    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    try {
      const user = await this.usersService.create({
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
      });

      return this.tokenService.issueTokens({ id: user.id, email: user.email, role: user.role });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async validateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      // Verify against a decoy so response time does not reveal whether the account exists.
      await argon2.verify(this.decoyHash, password).catch(() => false);
      return null;
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordMatches || !user.isActive) {
      return null;
    }

    return { id: user.id, email: user.email, role: user.role };
  }

  login(user: AuthenticatedUser): Promise<TokensDto> {
    return this.tokenService.issueTokens(user);
  }

  refresh(refreshToken: string): Promise<TokensDto> {
    return this.tokenService.rotate(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokenService.revokeByToken(refreshToken);
  }
}
