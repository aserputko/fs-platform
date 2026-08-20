import { Module } from '@nestjs/common';

import { UserDirectoryService } from './user-directory.service';

/** Infrastructure port rather than a CQRS feature, in the same spirit as KeyService. */
@Module({
  providers: [UserDirectoryService],
  exports: [UserDirectoryService],
})
export class UserDirectoryModule {}
