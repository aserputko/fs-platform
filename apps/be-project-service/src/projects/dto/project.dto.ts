import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Owner, taken from the access token `sub` claim' })
  userId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
