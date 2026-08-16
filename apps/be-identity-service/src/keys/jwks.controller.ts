import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { KeyService, type JwkSet } from './key.service';

@ApiTags('well-known')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly keyService: KeyService) {}

  @Public()
  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'RS256 public keys for verifying access tokens issued by this service' })
  @ApiOkResponse({
    schema: {
      example: {
        keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid: '3Yx...', n: 'wJq...', e: 'AQAB' }],
      },
    },
  })
  getJwks(): JwkSet {
    return this.keyService.getJwks();
  }
}
