import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Deliberately excludes email: this endpoint is bulk, so it must not enable harvesting. */
export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;
}
