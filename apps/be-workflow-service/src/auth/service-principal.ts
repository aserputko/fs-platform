/** A calling backend service, never a human. Deliberately not assignable to AuthenticatedUser. */
export interface ServicePrincipal {
  serviceId: string;
}

export interface ServiceTokenPayload {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}
