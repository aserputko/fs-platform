import { DomainValidationError } from '../../common/errors/domain-validation.error';
import type { AllowedAction } from '../../workflow-definitions/domain/workflow-definition.model';
import { ApprovalChain, type ApprovalChainProps } from './approval-chain.model';

const REQUESTOR = '018f2c9a-0000-7000-8000-00000000000a';
const APPROVER_A = '018f2c9a-0000-7000-8000-00000000000b';
const APPROVER_B = '018f2c9a-0000-7000-8000-00000000000c';
const STRANGER = '018f2c9a-0000-7000-8000-00000000000d';

const APPROVER_ACTIONS: AllowedAction[] = [
  { type: 'APPROVE', commentRequired: false },
  { type: 'REJECT', commentRequired: true },
  { type: 'CANCEL', commentRequired: false },
];

function chain(overrides: Partial<ApprovalChainProps> = {}): ApprovalChain {
  return ApprovalChain.fromProps({
    id: 'request-1',
    requestorUserId: REQUESTOR,
    status: 'PENDING',
    currentStepIndex: 1,
    version: 3,
    steps: [
      {
        id: 'step-0',
        index: 0,
        stepType: 'REQUESTOR',
        allowedActions: [{ type: 'SUBMIT', commentRequired: false }],
        status: 'COMPLETED',
      },
      {
        id: 'step-1',
        index: 1,
        stepType: 'APPROVER',
        allowedActions: APPROVER_ACTIONS,
        status: 'PENDING',
      },
    ],
    tasks: [
      { id: 'task-a', stepId: 'step-1', approverUserId: APPROVER_A, status: 'PENDING' },
      { id: 'task-b', stepId: 'step-1', approverUserId: APPROVER_B, status: 'PENDING' },
    ],
    ...overrides,
  });
}

/** A three-step chain sitting on its first (non-final) approver step. */
function longChain(): ApprovalChain {
  return chain({
    steps: [
      {
        id: 'step-0',
        index: 0,
        stepType: 'REQUESTOR',
        allowedActions: [{ type: 'SUBMIT', commentRequired: false }],
        status: 'COMPLETED',
      },
      {
        id: 'step-1',
        index: 1,
        stepType: 'APPROVER',
        allowedActions: APPROVER_ACTIONS,
        status: 'PENDING',
      },
      {
        id: 'step-2',
        index: 2,
        stepType: 'APPROVER',
        allowedActions: APPROVER_ACTIONS,
        status: 'PENDING',
      },
    ],
    tasks: [
      { id: 'task-a', stepId: 'step-1', approverUserId: APPROVER_A, status: 'PENDING' },
      { id: 'task-c', stepId: 'step-2', approverUserId: APPROVER_B, status: 'PENDING' },
    ],
  });
}

describe('ApprovalChain', () => {
  describe('canBeReadBy', () => {
    it('admits the requestor and every approver in the chain', () => {
      const subject = longChain();

      expect(subject.canBeReadBy(REQUESTOR)).toBe(true);
      expect(subject.canBeReadBy(APPROVER_A)).toBe(true);
      // Named on a step that has not been reached yet.
      expect(subject.canBeReadBy(APPROVER_B)).toBe(true);
    });

    it('rejects anyone not named in the chain', () => {
      expect(chain().canBeReadBy(STRANGER)).toBe(false);
    });
  });

  describe('availableActionsFor', () => {
    it('offers the current step approver its approver actions', () => {
      expect(chain().availableActionsFor(APPROVER_A)).toEqual(['APPROVE', 'REJECT']);
    });

    it('offers the requestor only CANCEL', () => {
      expect(chain().availableActionsFor(REQUESTOR)).toEqual(['CANCEL']);
    });

    it('offers nothing to an approver on a later step', () => {
      expect(longChain().availableActionsFor(APPROVER_B)).toEqual([]);
    });

    it('offers nothing once the request is closed', () => {
      expect(chain({ status: 'APPROVED' }).availableActionsFor(APPROVER_A)).toEqual([]);
    });
  });

  describe('apply APPROVE', () => {
    it('closes the request as APPROVED on the final step', () => {
      const result = chain().apply('APPROVE', APPROVER_A);

      expect(result.status).toBe('APPROVED');
      expect(result.currentStepIndex).toBe(1);
      expect(result.closedAt).toBeInstanceOf(Date);
      expect(result.expectedVersion).toBe(3);
      expect(result.history).toHaveLength(1);
    });

    it('advances to the next step and records a SYSTEM event when more steps remain', () => {
      const result = longChain().apply('APPROVE', APPROVER_A);

      expect(result.status).toBe('PENDING');
      expect(result.currentStepIndex).toBe(2);
      expect(result.closedAt).toBeNull();
      expect(result.history.map((entry) => entry.eventType)).toEqual(['APPROVE', 'STEP_ADVANCED']);
      expect(result.history[1]?.actorRole).toBe('SYSTEM');
      expect(result.history[1]?.actorUserId).toBeNull();
    });

    it('completes the acting task and skips its siblings', () => {
      const result = chain().apply('APPROVE', APPROVER_A);

      expect(result.taskUpdates).toEqual([
        { taskId: 'task-a', status: 'COMPLETED', actedAt: expect.any(Date) },
        { taskId: 'task-b', status: 'SKIPPED', actedAt: null },
      ]);
    });

    it('leaves tasks on later steps untouched', () => {
      const result = longChain().apply('APPROVE', APPROVER_A);

      expect(result.taskUpdates.map((task) => task.taskId)).toEqual(['task-a']);
    });
  });

  describe('apply REJECT', () => {
    it('terminates the whole request even mid-chain', () => {
      const result = longChain().apply('REJECT', APPROVER_A, 'not enough detail');

      expect(result.status).toBe('REJECTED');
      expect(result.closedAt).toBeInstanceOf(Date);
      expect(result.history[0]?.comment).toBe('not enough detail');
    });

    it('cancels every step that had not completed', () => {
      const result = longChain().apply('REJECT', APPROVER_A, 'no');

      expect(result.stepUpdates).toEqual([
        {
          stepId: 'step-1',
          status: 'COMPLETED',
          completedAt: expect.any(Date),
          completedByUserId: APPROVER_A,
        },
        { stepId: 'step-2', status: 'CANCELLED', completedAt: null, completedByUserId: null },
      ]);
    });

    it('requires a comment when the step marks one required', () => {
      expect(() => chain().apply('REJECT', APPROVER_A)).toThrow(DomainValidationError);
      expect(() => chain().apply('REJECT', APPROVER_A, '   ')).toThrow(DomainValidationError);
    });
  });

  describe('apply CANCEL', () => {
    it('lets the requestor cancel while the step allows it', () => {
      const result = chain().apply('CANCEL', REQUESTOR);

      expect(result.status).toBe('CANCELLED');
      expect(result.taskUpdates).toEqual([
        { taskId: 'task-a', status: 'CANCELLED', actedAt: null },
        { taskId: 'task-b', status: 'CANCELLED', actedAt: null },
      ]);
    });

    it('refuses an approver trying to cancel', () => {
      expect(() => chain().apply('CANCEL', APPROVER_A)).toThrow(DomainValidationError);
    });

    it('refuses once the chain has moved past a step that allows it', () => {
      const advanced = longChain();
      const onFinalStep = ApprovalChain.fromProps({
        id: advanced.id,
        requestorUserId: REQUESTOR,
        status: 'PENDING',
        currentStepIndex: 2,
        version: 4,
        steps: advanced.steps.map((step) =>
          step.index === 2
            ? { ...step, allowedActions: [APPROVER_ACTIONS[0]!, APPROVER_ACTIONS[1]!] }
            : step,
        ),
        tasks: advanced.tasks,
      });

      expect(onFinalStep.availableActionsFor(REQUESTOR)).toEqual([]);
      expect(() => onFinalStep.apply('CANCEL', REQUESTOR)).toThrow(DomainValidationError);
    });
  });

  describe('guards', () => {
    it('refuses any action on a closed request', () => {
      expect(() => chain({ status: 'REJECTED' }).apply('APPROVE', APPROVER_A)).toThrow(
        DomainValidationError,
      );
    });

    it('refuses an approver with no pending task on the current step', () => {
      expect(() => chain().apply('APPROVE', STRANGER)).toThrow(DomainValidationError);
    });

    it('refuses an action the step does not allow', () => {
      const restricted = chain({
        steps: [
          {
            id: 'step-0',
            index: 0,
            stepType: 'REQUESTOR',
            allowedActions: [{ type: 'SUBMIT', commentRequired: false }],
            status: 'COMPLETED',
          },
          {
            id: 'step-1',
            index: 1,
            stepType: 'APPROVER',
            allowedActions: [{ type: 'APPROVE', commentRequired: false }],
            status: 'PENDING',
          },
        ],
      });

      expect(() => restricted.apply('REJECT', APPROVER_A, 'no')).toThrow(DomainValidationError);
    });

    it('refuses SUBMIT, which only the engine records', () => {
      const submitStep = chain({
        currentStepIndex: 1,
        steps: [
          {
            id: 'step-0',
            index: 0,
            stepType: 'REQUESTOR',
            allowedActions: [{ type: 'SUBMIT', commentRequired: false }],
            status: 'COMPLETED',
          },
          {
            id: 'step-1',
            index: 1,
            stepType: 'APPROVER',
            allowedActions: [{ type: 'SUBMIT', commentRequired: false }],
            status: 'PENDING',
          },
        ],
      });

      expect(() => submitStep.apply('SUBMIT', APPROVER_A)).toThrow(DomainValidationError);
    });
  });
});
