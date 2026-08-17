import { DomainValidationError } from '../../common/errors/domain-validation.error';

export type Role = 'USER' | 'ADMIN';

export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MAX_LENGTH = 120;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Case-insensitive matching prevents two accounts differing only by capitalisation. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertValidEmail(email: string): string {
  const normalized = normalizeEmail(email);

  if (normalized.length === 0 || normalized.length > EMAIL_MAX_LENGTH) {
    throw new DomainValidationError('Email must be between 1 and 254 characters');
  }

  if (!EMAIL_PATTERN.test(normalized)) {
    throw new DomainValidationError('Email is not a valid address');
  }

  return normalized;
}

export function assertValidDisplayName(displayName: string | undefined): string | undefined {
  if (displayName === undefined) {
    return undefined;
  }

  const trimmed = displayName.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new DomainValidationError('Display name must be at most 120 characters');
  }

  return trimmed;
}

export function assertValidPasswordHash(passwordHash: string): string {
  // Guards against a plaintext password reaching persistence if hashing is ever skipped.
  if (!passwordHash.startsWith('$argon2')) {
    throw new DomainValidationError('Password must be hashed before persistence');
  }

  return passwordHash;
}

export interface NewUserProps {
  email: string;
  passwordHash: string;
  displayName?: string;
}

/** A validated user that has not been persisted yet, so it carries no identity or timestamps. */
export class NewUser {
  private constructor(
    readonly email: string,
    readonly passwordHash: string,
    readonly displayName: string | undefined,
  ) {}

  static create(props: NewUserProps): NewUser {
    return new NewUser(
      assertValidEmail(props.email),
      assertValidPasswordHash(props.passwordHash),
      assertValidDisplayName(props.displayName),
    );
  }
}

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  private constructor(
    readonly id: string,
    readonly email: string,
    readonly passwordHash: string,
    readonly displayName: string | null,
    readonly role: Role,
    readonly isActive: boolean,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  static fromProps(props: UserProps): User {
    return new User(
      props.id,
      props.email,
      props.passwordHash,
      props.displayName,
      props.role,
      props.isActive,
      props.createdAt,
      props.updatedAt,
    );
  }

  get isAdmin(): boolean {
    return this.role === 'ADMIN';
  }

  canAuthenticate(): boolean {
    return this.isActive;
  }
}
