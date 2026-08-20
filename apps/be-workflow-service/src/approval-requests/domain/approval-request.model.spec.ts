import { DomainValidationError } from '../../common/errors/domain-validation.error';
import { WorkflowDefinition } from '../../workflow-definitions/domain/workflow-definition.model';
import { NewApprovalRequest } from './approval-request.model';

const REQUESTOR = '018f2c9a-0000-7000-8000-00000000000a';
const APPROVER_A = '018f2c9a-0000-7000-8000-00000000000b';
const APPROVER_B = '018f2c9a-0000-7000-8000-00000000000c';

function definition(isActive = true): WorkflowDefinition {
  return WorkflowDefinition.fromProps({
    id: 'definition-1',
    key: 'generic-approval',
    name: 'Generic approval',
    isActive,
    steps: [
      {
        index: 0,
        name: 'Requestor',
        stepType: 'REQUESTOR',
        allowedActions: [{ type: 'SUBMIT', commentRequired: false }],
      },
      {
        index: 1,
        name: 'Approval',
        stepType: 'APPROVER',
        allowedActions: [{ type: 'APPROVE', commentRequired: false }],
      },
    ],
  });
}

const validProps = {
  definition: definition(),
  subject: '  Budget increase  ',
  description: 'Needs sign-off',
  requestorUserId: REQUESTOR,
  assignments: [{ stepIndex: 1, approverUserIds: [APPROVER_A, APPROVER_B] }],
  createdVia: 'USER' as const,
};

describe('NewApprovalRequest.create', () => {
  it('trims text and starts on the first approver step', () => {
    const request = NewApprovalRequest.create(validProps);

    expect(request.subject).toBe('Budget increase');
    expect(request.currentStepIndex).toBe(1);
    expect(request.definitionKey).toBe('generic-approval');
    expect(request.createdByService).toBeNull();
  });

  it('completes the requestor step and leaves approver steps pending', () => {
    const request = NewApprovalRequest.create(validProps);

    expect(request.steps.map((step) => [step.index, step.status])).toEqual([
      [0, 'COMPLETED'],
      [1, 'PENDING'],
    ]);
    expect(request.steps[0]?.approverUserIds).toEqual([]);
    expect(request.steps[1]?.approverUserIds).toEqual([APPROVER_A, APPROVER_B]);
  });

  it('rejects an inactive definition', () => {
    expect(() =>
      NewApprovalRequest.create({ ...validProps, definition: definition(false) }),
    ).toThrow(DomainValidationError);
  });

  it.each([
    ['a blank subject', { subject: '   ' }],
    ['an oversized subject', { subject: 'x'.repeat(257) }],
    ['a blank description', { description: '' }],
    ['an oversized description', { description: 'x'.repeat(257) }],
    ['a non-uuid requestor', { requestorUserId: 'not-a-uuid' }],
  ])('rejects %s', (_label, override) => {
    expect(() => NewApprovalRequest.create({ ...validProps, ...override })).toThrow(
      DomainValidationError,
    );
  });

  it('rejects an approver step with no approvers', () => {
    expect(() => NewApprovalRequest.create({ ...validProps, assignments: [] })).toThrow(
      DomainValidationError,
    );
  });

  it('rejects the same approver listed twice on one step', () => {
    expect(() =>
      NewApprovalRequest.create({
        ...validProps,
        assignments: [{ stepIndex: 1, approverUserIds: [APPROVER_A, APPROVER_A] }],
      }),
    ).toThrow(DomainValidationError);
  });

  it('rejects an assignment aimed at the requestor step', () => {
    expect(() =>
      NewApprovalRequest.create({
        ...validProps,
        assignments: [
          { stepIndex: 0, approverUserIds: [APPROVER_A] },
          { stepIndex: 1, approverUserIds: [APPROVER_A] },
        ],
      }),
    ).toThrow(DomainValidationError);
  });

  it('rejects an oversized source field', () => {
    expect(() => NewApprovalRequest.create({ ...validProps, sourceId: 'x'.repeat(65) })).toThrow(
      DomainValidationError,
    );
  });
});
