import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'The opaque refresh token returned by /auth/login or /auth/refresh' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  refreshToken!: string;
}
