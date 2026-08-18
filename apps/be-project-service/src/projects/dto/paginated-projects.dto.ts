import { ApiProperty } from '@nestjs/swagger';

import { ProjectDto } from './project.dto';

export class PaginatedProjectsDto {
  @ApiProperty({ type: [ProjectDto] })
  data!: ProjectDto[];

  @ApiProperty({ description: 'Total number of matching projects, ignoring pagination' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
