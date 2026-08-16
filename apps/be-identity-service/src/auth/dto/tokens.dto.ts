import { ApiProperty } from '@nestjs/swagger';

export class TokensDto {
  @ApiProperty({ description: 'RS256-signed JWT, carries the signing `kid` in its header' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque token, rotated on every use' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  expiresIn!: number;
}
