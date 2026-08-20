import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { ActionType } from '../../workflow-definitions/domain/workflow-definition.model';
import { COMMENT_MAX_LENGTH } from '../domain/approval-chain.model';

/** SUBMIT is recorded by the engine, so it is not offered as a performable action. */
const PERFORMABLE_ACTIONS: ActionType[] = ['APPROVE', 'REJECT', 'CANCEL'];

export class PerformActionDto {
  @ApiProperty({ enum: PERFORMABLE_ACTIONS })
  @IsIn(PERFORMABLE_ACTIONS)
  actionType!: ActionType;

  @ApiPropertyOptional({
    maxLength: COMMENT_MAX_LENGTH,
    description: 'Required for actions the step marks as commentRequired, such as REJECT.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(COMMENT_MAX_LENGTH)
  comment?: string;
}
