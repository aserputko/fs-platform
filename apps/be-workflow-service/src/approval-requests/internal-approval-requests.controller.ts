import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ServiceAuthGuard } from '../auth/guards/service-auth.guard';
import type { ServicePrincipal } from '../auth/service-principal';
import { CurrentService } from '../common/decorators/current-service.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateApprovalRequestCommand } from './commands/create-approval-request.command';
import { ApprovalRequestSummaryDto } from './dto/approval-request-summary.dto';
import { InternalCreateApprovalRequestDto } from './dto/create-approval-request.dto';

/**
 * `@Public()` only bypasses the global user-token guard; ServiceAuthGuard then requires a token
 * signed with the separate service key, so these routes are not reachable with a user token.
 */
@ApiTags('internal')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid service token' })
@Public()
@UseGuards(ServiceAuthGuard)
@Controller('internal/approval-requests')
export class InternalApprovalRequestsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @ApiOperation({ summary: 'Raise an approval request on behalf of a user' })
  @ApiCreatedResponse({ type: ApprovalRequestSummaryDto })
  @ApiNotFoundResponse({ description: 'Workflow definition not found' })
  create(
    @CurrentService() service: ServicePrincipal,
    @Body() dto: InternalCreateApprovalRequestDto,
  ): Promise<ApprovalRequestSummaryDto> {
    return this.commandBus.execute(
      new CreateApprovalRequestCommand(
        dto.definitionKey,
        dto.subject,
        dto.description,
        dto.requestorUserId,
        dto.approvers.map((assignment) => ({
          stepIndex: assignment.stepIndex,
          approverUserIds: assignment.approverUserIds,
        })),
        'SERVICE',
        dto.sourceType,
        dto.sourceId,
        service.serviceId,
      ),
    );
  }
}
