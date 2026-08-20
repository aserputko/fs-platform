import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { MAX_STEPS } from '../../workflow-definitions/domain/workflow-definition.model';
import {
  DESCRIPTION_MAX_LENGTH,
  SOURCE_FIELD_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
} from '../domain/approval-request.model';

export class StepAssignmentDto {
  @ApiProperty({ description: 'Index of an approver step in the chosen definition.' })
  @IsInt()
  @Min(1)
  stepIndex!: number;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  approverUserIds!: string[];
}

export class CreateApprovalRequestDto {
  @ApiProperty({ example: 'generic-approval' })
  @IsString()
  @MaxLength(128)
  definitionKey!: string;

  @ApiProperty({ maxLength: SUBJECT_MAX_LENGTH })
  @IsString()
  @MaxLength(SUBJECT_MAX_LENGTH)
  subject!: string;

  @ApiProperty({ maxLength: DESCRIPTION_MAX_LENGTH })
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description!: string;

  @ApiProperty({ type: [StepAssignmentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_STEPS)
  @ValidateNested({ each: true })
  @Type(() => StepAssignmentDto)
  approvers!: StepAssignmentDto[];

  @ApiPropertyOptional({ maxLength: SOURCE_FIELD_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(SOURCE_FIELD_MAX_LENGTH)
  sourceType?: string;

  @ApiPropertyOptional({ maxLength: SOURCE_FIELD_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(SOURCE_FIELD_MAX_LENGTH)
  sourceId?: string;
}

/** The service token authenticates the caller; this says which human the request is for. */
export class InternalCreateApprovalRequestDto extends CreateApprovalRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestorUserId!: string;
}
