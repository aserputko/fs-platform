import { ConflictException, NotFoundException } from '@nestjs/common';

import type { ApprovalRequestsRepository } from '../approval-requests.repository';
import { ApprovalChain } from '../domain/approval-chain.model';
import {
  PerformApprovalActionCommand,
  PerformApprovalActionHandler,
} from './perform-approval-action.command';

const REQUESTOR = '018f2c9a-0000-7000-8000-00000000000a';
const APPROVER = '018f2c9a-0000-7000-8000-00000000000b';
const STRANGER = '018f2c9a-0000-7000-8000-00000000000d';

function chain(): ApprovalChain {
  return ApprovalChain.fromProps({
    id: 'request-1',
    requestorUserId: REQUESTOR,
    status: 'PENDING',
    currentStepIndex: 1,
    version: 0,
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
    tasks: [{ id: 'task-a', stepId: 'step-1', approverUserId: APPROVER, status: 'PENDING' }],
  });
}

describe('PerformApprovalActionHandler', () => {
  const requests = { findChain: jest.fn(), applyTransition: jest.fn() };
  const handler = new PerformApprovalActionHandler(
    requests as unknown as ApprovalRequestsRepository,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('applies the transition the domain produced', async () => {
    requests.findChain.mockResolvedValue(chain());

    await handler.execute(new PerformApprovalActionCommand('request-1', APPROVER, 'APPROVE'));

    const [result] = requests.applyTransition.mock.calls[0] as [{ status: string }];
    expect(result.status).toBe('APPROVED');
  });

  it('404s an unknown request', async () => {
    requests.findChain.mockResolvedValue(null);

    await expect(
      handler.execute(new PerformApprovalActionCommand('missing', APPROVER, 'APPROVE')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s rather than 403s someone outside the chain', async () => {
    requests.findChain.mockResolvedValue(chain());

    await expect(
      handler.execute(new PerformApprovalActionCommand('request-1', STRANGER, 'APPROVE')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(requests.applyTransition).not.toHaveBeenCalled();
  });

  it('409s a participant whose action is not available', async () => {
    requests.findChain.mockResolvedValue(chain());

    await expect(
      handler.execute(new PerformApprovalActionCommand('request-1', REQUESTOR, 'APPROVE')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(requests.applyTransition).not.toHaveBeenCalled();
  });
});
