import type { ActionType } from '../../../workflow-definitions/domain/workflow-definition.model';
import type { ActorRole } from '../approval-chain.model';

/**
 * How an action changes the request. Adding SEND_BACK or FORWARD later means one entry here
 * plus one branch in ApprovalChain.apply — no handler, controller or schema change.
 */
export type ActionOutcome =
  { kind: 'ADVANCE' } | { kind: 'TERMINATE'; status: 'REJECTED' | 'CANCELLED' };

export interface ActionDefinition {
  readonly type: ActionType;
  /** Who is allowed to perform it; SYSTEM actions are never reachable through the API. */
  readonly actorRole: ActorRole;
  readonly outcome: ActionOutcome;
}

export const ACTION_REGISTRY: Readonly<Record<ActionType, ActionDefinition>> = {
  SUBMIT: { type: 'SUBMIT', actorRole: 'SYSTEM', outcome: { kind: 'ADVANCE' } },
  APPROVE: { type: 'APPROVE', actorRole: 'APPROVER', outcome: { kind: 'ADVANCE' } },
  REJECT: {
    type: 'REJECT',
    actorRole: 'APPROVER',
    outcome: { kind: 'TERMINATE', status: 'REJECTED' },
  },
  CANCEL: {
    type: 'CANCEL',
    actorRole: 'REQUESTOR',
    outcome: { kind: 'TERMINATE', status: 'CANCELLED' },
  },
};
