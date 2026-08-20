import { DomainValidationError } from '../../common/errors/domain-validation.error';

export type ActionType = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL';
export type StepType = 'REQUESTOR' | 'APPROVER';

const ACTION_TYPES: readonly ActionType[] = ['SUBMIT', 'APPROVE', 'REJECT', 'CANCEL'];

export const MIN_STEPS = 2;
export const MAX_STEPS = 5;

/** One entry of a step's configurable action list, stored as JSON on the step. */
export interface AllowedAction {
  type: ActionType;
  commentRequired: boolean;
}

function isActionType(value: unknown): value is ActionType {
  return typeof value === 'string' && ACTION_TYPES.includes(value as ActionType);
}

/** Parses the `allowedActions` JSON column, which Prisma types only as `JsonValue`. */
export function assertValidAllowedActions(value: unknown, label: string): AllowedAction[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DomainValidationError(`${label} must be a non-empty array of actions`);
  }

  const actions = value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new DomainValidationError(`${label} contains an entry that is not an object`);
    }

    const { type, commentRequired } = entry as { type?: unknown; commentRequired?: unknown };

    if (!isActionType(type)) {
      throw new DomainValidationError(`${label} contains an unknown action type`);
    }

    return { type, commentRequired: commentRequired === true };
  });

  const types = new Set(actions.map((action) => action.type));
  if (types.size !== actions.length) {
    throw new DomainValidationError(`${label} contains duplicate action types`);
  }

  return actions;
}

export interface StepTemplateProps {
  index: number;
  name: string;
  stepType: StepType;
  allowedActions: AllowedAction[];
}

export class StepTemplate {
  private constructor(
    readonly index: number,
    readonly name: string,
    readonly stepType: StepType,
    readonly allowedActions: AllowedAction[],
  ) {}

  static fromProps(props: StepTemplateProps): StepTemplate {
    return new StepTemplate(props.index, props.name, props.stepType, props.allowedActions);
  }
}

export interface WorkflowDefinitionProps {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  steps: StepTemplateProps[];
}

export class WorkflowDefinition {
  private constructor(
    readonly id: string,
    readonly key: string,
    readonly name: string,
    readonly isActive: boolean,
    readonly steps: StepTemplate[],
  ) {}

  static fromProps(props: WorkflowDefinitionProps): WorkflowDefinition {
    const steps = [...props.steps]
      .sort((a, b) => a.index - b.index)
      .map((step) => StepTemplate.fromProps(step));

    if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) {
      throw new DomainValidationError(
        `Definition "${props.key}" must have between ${MIN_STEPS} and ${MAX_STEPS} steps`,
      );
    }

    if (steps[0]?.stepType !== 'REQUESTOR') {
      throw new DomainValidationError(`Definition "${props.key}" must start with a requestor step`);
    }

    if (steps.slice(1).some((step) => step.stepType !== 'APPROVER')) {
      throw new DomainValidationError(
        `Definition "${props.key}" may only have approver steps after the requestor step`,
      );
    }

    return new WorkflowDefinition(props.id, props.key, props.name, props.isActive, steps);
  }

  get approverSteps(): StepTemplate[] {
    return this.steps.filter((step) => step.stepType === 'APPROVER');
  }
}
