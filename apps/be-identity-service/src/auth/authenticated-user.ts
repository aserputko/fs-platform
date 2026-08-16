import type { Role } from '../generated/prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}
