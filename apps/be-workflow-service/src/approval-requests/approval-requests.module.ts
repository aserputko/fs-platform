import { Module } from '@nestjs/common';

import { UserDirectoryModule } from '../user-directory/user-directory.module';
import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsRepository } from './approval-requests.repository';
import { CreateApprovalRequestHandler } from './commands/create-approval-request.command';
import { PerformApprovalActionHandler } from './commands/perform-approval-action.command';
import { InternalApprovalRequestsController } from './internal-approval-requests.controller';
import { FindRequestsBySourceHandler } from './queries/find-requests-by-source.query';
import { GetApprovalRequestHandler } from './queries/get-approval-request.query';
import { ListApprovalRequestsHandler } from './queries/list-approval-requests.query';

@Module({
  imports: [UserDirectoryModule],
  controllers: [ApprovalRequestsController, InternalApprovalRequestsController],
  providers: [
    ApprovalRequestsRepository,
    CreateApprovalRequestHandler,
    PerformApprovalActionHandler,
    GetApprovalRequestHandler,
    ListApprovalRequestsHandler,
    FindRequestsBySourceHandler,
  ],
})
export class ApprovalRequestsModule {}
