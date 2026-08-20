import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export const MAX_USER_IDS = 100;

export class FindUserSummariesQueryDto {
  @ApiProperty({
    type: String,
    description: `Comma-separated user ids, at most ${MAX_USER_IDS}.`,
    example: '018f2c9a-0000-7000-8000-000000000001,018f2c9a-0000-7000-8000-000000000002',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_USER_IDS)
  @IsUUID('all', { each: true })
  ids!: string[];
}
