import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '../domain/project.model';

export class CreateProjectDto {
  @ApiProperty({ maxLength: TITLE_MAX_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(TITLE_MAX_LENGTH)
  title!: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description?: string;
}
