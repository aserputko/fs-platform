import { DomainValidationError } from '../../common/errors/domain-validation.error';
import type {
  ActionType,
  AllowedAction,
  StepType,
} from '../../workflow-definitions/domain/workflow-definition.model';
import { ACTION_REGISTRY } from './actions/action-registry';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type StepStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
export type TaskStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
export type ActorRole = 'REQUESTOR' | 'APPROVER' | 'SYSTEM';
export type HistoryEventType = ActionType | 'STEP_ADVANCED';

export const COMMENT_MAX_LENGTH = 1024;

export function normalizeComment(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export interface ChainStepProps {
  id: string;
  index: number;
  stepType: StepType;
  allowedActions: AllowedAction[];
  status: StepStatus;
}

export interface ChainTaskProps {
  id: string;
  stepId: string;
  approverUserId: string;
  status: TaskStatus;
}

export interface ApprovalChainProps {
  id: string;
  requestorUserId: string;
  status: RequestStatus;
  currentStepIndex: number;
  version: number;
  steps: ChainStepProps[];
  tasks: ChainTaskProps[];
}

export interface TaskUpdate {
  taskId: string;
  status: TaskStatus;
  actedAt: Date | null;
}

export interface StepUpdate {
  stepId: string;
  status: StepStatus;
  completedAt: Date | null;
  completedByUserId: string | null;
}

export interface HistoryEntryDraft {
  stepIndex: number;
  eventType: HistoryEventType;
  actorUserId: string | null;
  actorRole: ActorRole;
  comment: string | null;
  fromStatus: RequestStatus;
  toStatus: RequestStatus;
}

export interface TransitionResult {
  requestId: string;
  /** The version the write must match; a mismatch means someone else transitioned first. */
  expectedVersion: number;
  status: RequestStatus;
  currentStepIndex: number;
  closedAt: Date | null;
  taskUpdates: TaskUpdate[];
  stepUpdates: StepUpdate[];
  history: HistoryEntryDraft[];
}

/**
 * The live state of one approval request: its snapshot steps, its per-approver tasks and the
 * rules for moving between them. Framework-free; the repository persists what `apply` returns.
 */
export class ApprovalChain {
  private constructor(
    readonly id: string,
    readonly requestorUserId: string,
    readonly status: RequestStatus,
    readonly currentStepIndex: number,
    readonly version: number,
    readonly steps: ChainStepProps[],
    readonly tasks: ChainTaskProps[],
  ) {}

  static fromProps(props: ApprovalChainProps): ApprovalChain {
    return new ApprovalChain(
      props.id,
      props.requestorUserId,
      props.status,
      props.currentStepIndex,
      props.version,
      [...props.steps].sort((a, b) => a.index - b.index),
      props.tasks,
    );
  }

  get isOpen(): boolean {
    return this.status === 'PENDING';
  }

  private get currentStep(): ChainStepProps | undefined {
    return this.steps.find((step) => step.index === this.currentStepIndex);
  }

  private get lastStepIndex(): number {
    return this.steps[this.steps.length - 1]?.index ?? this.currentStepIndex;
  }

  /** Everyone named anywhere in the chain can read it, including on already-passed steps. */
  canBeReadBy(userId: string): boolean {
    return (
      this.requestorUserId === userId || this.tasks.some((task) => task.approverUserId === userId)
    );
  }

  private pendingTaskFor(userId: string): ChainTaskProps | undefined {
    const step = this.currentStep;
    if (!step) {
      return undefined;
    }

    return this.tasks.find(
      (task) =>
        task.stepId === step.id && task.approverUserId === userId && task.status === 'PENDING',
    );
  }

  availableActionsFor(userId: string): ActionType[] {
    const step = this.currentStep;
    if (!this.isOpen || !step) {
      return [];
    }

    const isRequestor = this.requestorUserId === userId;
    const hasPendingTask = this.pendingTaskFor(userId) !== undefined;

    return step.allowedActions
      .filter((allowed) => {
        const definition = ACTION_REGISTRY[allowed.type];
        if (definition.actorRole === 'REQUESTOR') {
          return isRequestor;
        }
        if (definition.actorRole === 'APPROVER') {
          return hasPendingTask;
        }
        return false;
      })
      .map((allowed) => allowed.type);
  }

  apply(actionType: ActionType, userId: string, rawComment?: string | null): TransitionResult {
    if (!this.isOpen) {
      throw new DomainValidationError('Request is already closed');
    }

    const step = this.currentStep;
    if (!step) {
      throw new DomainValidationError('Request has no pending step');
    }

    const allowed: AllowedAction | undefined = step.allowedActions.find(
      (candidate) => candidate.type === actionType,
    );
    if (!allowed) {
      throw new DomainValidationError(`Action ${actionType} is not allowed on the current step`);
    }

    const definition = ACTION_REGISTRY[actionType];
    if (definition.actorRole === 'SYSTEM') {
      throw new DomainValidationError(`Action ${actionType} cannot be performed by a user`);
    }

    const comment = normalizeComment(rawComment);
    if (allowed.commentRequired && !comment) {
      throw new DomainValidationError(`Action ${actionType} requires a comment`);
    }
    if (comment && comment.length > COMMENT_MAX_LENGTH) {
      throw new DomainValidationError(`Comment must be at most ${COMMENT_MAX_LENGTH} characters`);
    }

    const actorTask = definition.actorRole === 'APPROVER' ? this.pendingTaskFor(userId) : undefined;

    if (definition.actorRole === 'REQUESTOR' && this.requestorUserId !== userId) {
      throw new DomainValidationError(`Only the requestor may perform ${actionType}`);
    }
    if (definition.actorRole === 'APPROVER' && !actorTask) {
      throw new DomainValidationError('No pending approval is assigned to this user');
    }

    const now = new Date();
    const actorRole = definition.actorRole;

    if (definition.outcome.kind === 'TERMINATE') {
      return this.terminate(definition.outcome.status, step, userId, actorRole, comment, now);
    }

    return this.advance(step, userId, actorTask, comment, now);
  }

  private advance(
    step: ChainStepProps,
    userId: string,
    actorTask: ChainTaskProps | undefined,
    comment: string | null,
    now: Date,
  ): TransitionResult {
    const isFinalStep = step.index === this.lastStepIndex;
    const nextStatus: RequestStatus = isFinalStep ? 'APPROVED' : 'PENDING';

    const history: HistoryEntryDraft[] = [
      {
        stepIndex: step.index,
        eventType: 'APPROVE',
        actorUserId: userId,
        actorRole: 'APPROVER',
        comment,
        fromStatus: this.status,
        toStatus: nextStatus,
      },
    ];

    if (!isFinalStep) {
      history.push({
        stepIndex: step.index + 1,
        eventType: 'STEP_ADVANCED',
        actorUserId: null,
        actorRole: 'SYSTEM',
        comment: null,
        fromStatus: this.status,
        toStatus: nextStatus,
      });
    }

    return {
      requestId: this.id,
      expectedVersion: this.version,
      status: nextStatus,
      currentStepIndex: isFinalStep ? step.index : step.index + 1,
      closedAt: isFinalStep ? now : null,
      taskUpdates: this.completeStepTasks(step, actorTask, now),
      stepUpdates: [
        { stepId: step.id, status: 'COMPLETED', completedAt: now, completedByUserId: userId },
      ],
      history,
    };
  }

  private terminate(
    status: 'REJECTED' | 'CANCELLED',
    step: ChainStepProps,
    userId: string,
    actorRole: ActorRole,
    comment: string | null,
    now: Date,
  ): TransitionResult {
    const isRejection = status === 'REJECTED';

    // A rejection closes the acting approver's task; a cancellation closes nobody's.
    const actorTask = isRejection ? this.pendingTaskFor(userId) : undefined;
    const taskUpdates = isRejection
      ? this.completeStepTasks(step, actorTask, now)
      : this.tasks
          .filter((task) => task.status === 'PENDING')
          .map((task) => ({ taskId: task.id, status: 'CANCELLED' as const, actedAt: null }));

    const stepUpdates: StepUpdate[] = this.steps
      .filter((candidate) => candidate.status === 'PENDING')
      .map((candidate) => ({
        stepId: candidate.id,
        status:
          candidate.id === step.id && isRejection ? ('COMPLETED' as const) : ('CANCELLED' as const),
        completedAt: candidate.id === step.id && isRejection ? now : null,
        completedByUserId: candidate.id === step.id && isRejection ? userId : null,
      }));

    return {
      requestId: this.id,
      expectedVersion: this.version,
      status,
      currentStepIndex: step.index,
      closedAt: now,
      taskUpdates,
      stepUpdates,
      history: [
        {
          stepIndex: step.index,
          eventType: isRejection ? 'REJECT' : 'CANCEL',
          actorUserId: userId,
          actorRole,
          comment,
          fromStatus: this.status,
          toStatus: status,
        },
      ],
    };
  }

  /** Any-one-wins: the acting task completes and every sibling on that step is skipped. */
  private completeStepTasks(
    step: ChainStepProps,
    actorTask: ChainTaskProps | undefined,
    now: Date,
  ): TaskUpdate[] {
    return this.tasks
      .filter((task) => task.stepId === step.id && task.status === 'PENDING')
      .map((task) =>
        task.id === actorTask?.id
          ? { taskId: task.id, status: 'COMPLETED' as const, actedAt: now }
          : { taskId: task.id, status: 'SKIPPED' as const, actedAt: null },
      );
  }
}
