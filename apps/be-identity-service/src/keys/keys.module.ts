import { Module } from '@nestjs/common';

import { JwksController } from './jwks.controller';
import { KeyService } from './key.service';

@Module({
  controllers: [JwksController],
  providers: [KeyService],
  exports: [KeyService],
})
export class KeysModule {}
