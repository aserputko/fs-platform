/** Mirrors be-identity-service's Role enum; this service has no user table to import it from. */
export type Role = 'USER' | 'ADMIN';

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
