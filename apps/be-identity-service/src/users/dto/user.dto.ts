import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Role } from '../domain/user.model';

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
