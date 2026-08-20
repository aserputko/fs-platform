import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  ActionType,
  StepType,
} from '../../workflow-definitions/domain/workflow-definition.model';
import type {
  ActorRole,
  HistoryEventType,
  RequestStatus,
  StepStatus,
  TaskStatus,
} from '../domain/approval-chain.model';
import { ApprovalRequestSummaryDto, REQUEST_STATUSES } from './approval-request-summary.dto';

export class ApprovalTaskDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  approverUserId!: string;

  @ApiPropertyOptional({ nullable: true })
  approverDisplayName!: string | null;

  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'SKIPPED', 'CANCELLED'] })
  status!: TaskStatus;

  @ApiPropertyOptional({ nullable: true })
  actedAt!: Date | null;
}

export class ApprovalStepDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  index!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['REQUESTOR', 'APPROVER'] })
  stepType!: StepType;

  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'SKIPPED', 'CANCELLED'] })
  status!: StepStatus;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  completedByUserId!: string | null;

  @ApiProperty({ type: [ApprovalTaskDto] })
  approvers!: ApprovalTaskDto[];
}

export class ApprovalHistoryEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  stepIndex!: number;

  @ApiProperty({ enum: ['SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'STEP_ADVANCED'] })
  eventType!: HistoryEventType;

  @ApiPropertyOptional({ nullable: true, description: 'Null for SYSTEM events.' })
  actorUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  actorDisplayName!: string | null;

  @ApiProperty({ enum: ['REQUESTOR', 'APPROVER', 'SYSTEM'] })
  actorRole!: ActorRole;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiProperty({ enum: REQUEST_STATUSES })
  fromStatus!: RequestStatus;

  @ApiProperty({ enum: REQUEST_STATUSES })
  toStatus!: RequestStatus;

  @ApiProperty()
  createdAt!: Date;
}

export class ApprovalRequestDetailsDto extends ApprovalRequestSummaryDto {
  @ApiProperty({ type: [ApprovalStepDto] })
  chain!: ApprovalStepDto[];

  @ApiProperty({ type: [ApprovalHistoryEntryDto] })
  history!: ApprovalHistoryEntryDto[];

  @ApiProperty({
    enum: ['SUBMIT', 'APPROVE', 'REJECT', 'CANCEL'],
    isArray: true,
    description: 'Actions the calling user may perform right now.',
  })
  availableActions!: ActionType[];
}
