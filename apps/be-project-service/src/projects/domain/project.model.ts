import { DomainValidationError } from '../../common/errors/domain-validation.error';

export const TITLE_MAX_LENGTH = 256;
export const DESCRIPTION_MAX_LENGTH = 1024;

export function normalizeTitle(title: string): string {
  return title.trim();
}

export function assertValidTitle(title: string): string {
  const normalized = normalizeTitle(title);

  if (normalized.length === 0) {
    throw new DomainValidationError('Title must not be empty');
  }

  if (normalized.length > TITLE_MAX_LENGTH) {
    throw new DomainValidationError(`Title must be at most ${TITLE_MAX_LENGTH} characters`);
  }

  return normalized;
}

export function assertValidDescription(description: string | undefined): string | undefined {
  if (description === undefined) {
    return undefined;
  }

  const normalized = description.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > DESCRIPTION_MAX_LENGTH) {
    throw new DomainValidationError(
      `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
    );
  }

  return normalized;
}

export function assertValidUserId(userId: string): string {
  if (userId.trim().length === 0) {
    throw new DomainValidationError('Project must belong to a user');
  }

  return userId;
}

interface NewProjectProps {
  userId: string;
  title: string;
  description?: string;
}

/** A validated project that has not been persisted yet, so it carries no identity or timestamps. */
export class NewProject {
  private constructor(
    readonly userId: string,
    readonly title: string,
    readonly description: string | undefined,
  ) {}

  static create(props: NewProjectProps): NewProject {
    return new NewProject(
      assertValidUserId(props.userId),
      assertValidTitle(props.title),
      assertValidDescription(props.description),
    );
  }
}

interface ProjectPatchProps {
  title?: string;
  description?: string | null;
}

/** The validated subset of fields a caller may change on an existing project. */
export class ProjectPatch {
  private constructor(
    readonly title: string | undefined,
    readonly description: string | null | undefined,
  ) {}

  static create(props: ProjectPatchProps): ProjectPatch {
    if (props.title === undefined && props.description === undefined) {
      throw new DomainValidationError('At least one field must be provided');
    }

    // An explicit null clears the column, which is different from omitting the field.
    const description =
      props.description === null ? null : (assertValidDescription(props.description) ?? null);

    return new ProjectPatch(
      props.title === undefined ? undefined : assertValidTitle(props.title),
      props.description === undefined ? undefined : description,
    );
  }
}

interface ProjectProps {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Project {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly title: string,
    readonly description: string | null,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  static fromProps(props: ProjectProps): Project {
    return new Project(
      props.id,
      props.userId,
      props.title,
      props.description,
      props.createdAt,
      props.updatedAt,
    );
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }
}
