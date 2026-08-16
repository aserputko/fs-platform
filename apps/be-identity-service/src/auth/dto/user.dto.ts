import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Role } from '../../generated/prisma/client';

export class UserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ enum: ['USER', 'ADMIN'] })
  role!: Role;

  @ApiProperty()
  createdAt!: Date;
}
