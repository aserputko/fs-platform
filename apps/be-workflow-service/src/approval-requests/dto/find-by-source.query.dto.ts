import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import { SOURCE_FIELD_MAX_LENGTH } from '../domain/approval-request.model';

/** Both are required: this is the executor's "what happened to my thing?" lookup (O1). */
export class FindBySourceQueryDto {
  @ApiProperty({ maxLength: SOURCE_FIELD_MAX_LENGTH, example: 'project' })
  @IsString()
  @MaxLength(SOURCE_FIELD_MAX_LENGTH)
  sourceType!: string;

  @ApiProperty({ maxLength: SOURCE_FIELD_MAX_LENGTH })
  @IsString()
  @MaxLength(SOURCE_FIELD_MAX_LENGTH)
  sourceId!: string;
}
