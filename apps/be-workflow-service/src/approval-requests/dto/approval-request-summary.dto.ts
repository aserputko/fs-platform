import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { RequestStatus } from '../domain/approval-chain.model';

export const REQUEST_STATUSES: RequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export class ApprovalRequestSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 256 })
  subject!: string;

  @ApiProperty({ maxLength: 256 })
  description!: string;

  @ApiProperty({ enum: REQUEST_STATUSES })
  status!: RequestStatus;

  @ApiProperty({ format: 'uuid' })
  requestorUserId!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Null when identity could not be reached.' })
  requestorDisplayName!: string | null;

  @ApiProperty()
  currentStepIndex!: number;

  @ApiProperty()
  definitionKey!: string;

  @ApiPropertyOptional({ nullable: true })
  sourceType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  closedAt!: Date | null;
}
