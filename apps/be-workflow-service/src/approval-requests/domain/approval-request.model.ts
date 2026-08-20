import { DomainValidationError } from '../../common/errors/domain-validation.error';
import type {
  AllowedAction,
  StepType,
  WorkflowDefinition,
} from '../../workflow-definitions/domain/workflow-definition.model';

export const SUBJECT_MAX_LENGTH = 256;
export const DESCRIPTION_MAX_LENGTH = 256;
export const SOURCE_FIELD_MAX_LENGTH = 64;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreatedVia = 'USER' | 'SERVICE';

export function assertValidSubject(value: string): string {
  const subject = value.trim();

  if (!subject) {
    throw new DomainValidationError('Subject is required');
  }
  if (subject.length > SUBJECT_MAX_LENGTH) {
    throw new DomainValidationError(`Subject must be at most ${SUBJECT_MAX_LENGTH} characters`);
  }

  return subject;
}

export function assertValidDescription(value: string): string {
  const description = value.trim();

  if (!description) {
    throw new DomainValidationError('Description is required');
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    throw new DomainValidationError(
      `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
    );
  }

  return description;
}

export function assertValidUserId(value: string, label: string): string {
  const userId = value.trim();

  if (!UUID_PATTERN.test(userId)) {
    throw new DomainValidationError(`${label} must be a UUID`);
  }

  return userId;
}

/** Approvers for one approver step, supplied by the caller (E1: explicit ids, no role resolution). */
export interface StepAssignment {
  stepIndex: number;
  approverUserIds: string[];
}

export interface NewApprovalRequestProps {
  definition: WorkflowDefinition;
  subject: string;
  description: string;
  requestorUserId: string;
  assignments: StepAssignment[];
  sourceType?: string | null;
  sourceId?: string | null;
  createdVia: CreatedVia;
  createdByService?: string | null;
}

export interface PlannedStep {
  index: number;
  name: string;
  stepType: StepType;
  allowedActions: AllowedAction[];
  /** REQUESTOR steps complete at creation; approver steps start pending. */
  status: 'PENDING' | 'COMPLETED';
  approverUserIds: string[];
}

/**
 * A validated, not-yet-persisted request together with the snapshot of the chain it will own.
 * Snapshotting here is what makes later edits to a definition unable to disturb this request.
 */
export class NewApprovalRequest {
  private constructor(
    readonly definitionId: string,
    readonly definitionKey: string,
    readonly subject: string,
    readonly description: string,
    readonly requestorUserId: string,
    readonly currentStepIndex: number,
    readonly steps: PlannedStep[],
    readonly sourceType: string | null,
    readonly sourceId: string | null,
    readonly createdVia: CreatedVia,
    readonly createdByService: string | null,
  ) {}

  static create(props: NewApprovalRequestProps): NewApprovalRequest {
    const { definition } = props;

    if (!definition.isActive) {
      throw new DomainValidationError(`Workflow definition "${definition.key}" is not active`);
    }

    const requestorUserId = assertValidUserId(props.requestorUserId, 'requestorUserId');
    const assignmentsByIndex = new Map(
      props.assignments.map((assignment) => [assignment.stepIndex, assignment]),
    );

    const approverIndexes = definition.approverSteps.map((step) => step.index);
    for (const stepIndex of assignmentsByIndex.keys()) {
      if (!approverIndexes.includes(stepIndex)) {
        throw new DomainValidationError(`Step ${stepIndex} is not an approver step`);
      }
    }

    const steps: PlannedStep[] = definition.steps.map((step) => {
      if (step.stepType === 'REQUESTOR') {
        return { ...step, status: 'COMPLETED' as const, approverUserIds: [] };
      }

      const assignment = assignmentsByIndex.get(step.index);
      if (!assignment || assignment.approverUserIds.length === 0) {
        throw new DomainValidationError(`Step ${step.index} needs at least one approver`);
      }

      const approverUserIds = assignment.approverUserIds.map((userId, position) =>
        assertValidUserId(userId, `approvers[${step.index}][${position}]`),
      );

      if (new Set(approverUserIds).size !== approverUserIds.length) {
        throw new DomainValidationError(`Step ${step.index} lists the same approver twice`);
      }

      return { ...step, status: 'PENDING' as const, approverUserIds };
    });

    const firstApproverIndex = definition.approverSteps[0]?.index;
    if (firstApproverIndex === undefined) {
      throw new DomainValidationError(
        `Workflow definition "${definition.key}" has no approver steps`,
      );
    }

    return new NewApprovalRequest(
      definition.id,
      definition.key,
      assertValidSubject(props.subject),
      assertValidDescription(props.description),
      requestorUserId,
      firstApproverIndex,
      steps,
      assertOptionalSourceField(props.sourceType, 'sourceType'),
      assertOptionalSourceField(props.sourceId, 'sourceId'),
      props.createdVia,
      props.createdByService?.trim() || null,
    );
  }
}

function assertOptionalSourceField(value: string | null | undefined, label: string): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }
  if (trimmed.length > SOURCE_FIELD_MAX_LENGTH) {
    throw new DomainValidationError(
      `${label} must be at most ${SOURCE_FIELD_MAX_LENGTH} characters`,
    );
  }

  return trimmed;
}
