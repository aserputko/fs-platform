import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateApprovalRequestCommand } from './commands/create-approval-request.command';
import { PerformApprovalActionCommand } from './commands/perform-approval-action.command';
import { ApprovalRequestDetailsDto } from './dto/approval-request-details.dto';
import { ApprovalRequestSummaryDto } from './dto/approval-request-summary.dto';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { FindBySourceQueryDto } from './dto/find-by-source.query.dto';
import {
  ListApprovalRequestsQueryDto,
  PaginatedApprovalRequestsDto,
} from './dto/list-approval-requests.query.dto';
import { PerformActionDto } from './dto/perform-action.dto';
import { FindRequestsBySourceQuery } from './queries/find-requests-by-source.query';
import { GetApprovalRequestQuery } from './queries/get-approval-request.query';
import { ListApprovalRequestsQuery } from './queries/list-approval-requests.query';

/** Forwarded to identity so display-name lookups run under the caller's own authority. */
function bearerTokenOf(request: Request): string | undefined {
  const header = request.headers.authorization;
  return header?.toLowerCase().startsWith('bearer ') ? header.slice(7) : undefined;
}

@ApiTags('approval-requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Raise an approval request as the calling user' })
  @ApiCreatedResponse({ type: ApprovalRequestSummaryDto })
  @ApiNotFoundResponse({ description: 'Workflow definition not found' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApprovalRequestDto,
  ): Promise<ApprovalRequestSummaryDto> {
    return this.commandBus.execute(
      new CreateApprovalRequestCommand(
        dto.definitionKey,
        dto.subject,
        dto.description,
        user.id,
        dto.approvers.map((assignment) => ({
          stepIndex: assignment.stepIndex,
          approverUserIds: assignment.approverUserIds,
        })),
        'USER',
        dto.sourceType,
        dto.sourceId,
      ),
    );
  }

  @Get('inbox')
  @ApiOperation({ summary: 'Requests awaiting an action from the calling user' })
  @ApiOkResponse({ type: PaginatedApprovalRequestsDto })
  inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ListApprovalRequestsQueryDto,
    @Req() request: Request,
  ): Promise<PaginatedApprovalRequestsDto> {
    return this.queryBus.execute(
      new ListApprovalRequestsQuery('inbox', user.id, filters, bearerTokenOf(request)),
    );
  }

  @Get('outbox')
  @ApiOperation({ summary: 'Requests raised by the calling user' })
  @ApiOkResponse({ type: PaginatedApprovalRequestsDto })
  outbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ListApprovalRequestsQueryDto,
    @Req() request: Request,
  ): Promise<PaginatedApprovalRequestsDto> {
    return this.queryBus.execute(
      new ListApprovalRequestsQuery('outbox', user.id, filters, bearerTokenOf(request)),
    );
  }

  @Get('by-source')
  @ApiOperation({ summary: 'Requests raised for one business object' })
  @ApiOkResponse({ type: [ApprovalRequestSummaryDto] })
  bySource(@Query() query: FindBySourceQueryDto): Promise<ApprovalRequestSummaryDto[]> {
    return this.queryBus.execute(new FindRequestsBySourceQuery(query.sourceType, query.sourceId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chain, history and the actions available to the caller' })
  @ApiOkResponse({ type: ApprovalRequestDetailsDto })
  @ApiNotFoundResponse({ description: 'Unknown request, or the caller is not part of its chain' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ApprovalRequestDetailsDto> {
    return this.queryBus.execute(new GetApprovalRequestQuery(id, user.id, bearerTokenOf(request)));
  }

  @Post(':id/actions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Perform a configured action; the action list is per step' })
  @ApiNoContentResponse({ description: 'Action applied' })
  @ApiNotFoundResponse({ description: 'Unknown request, or the caller is not part of its chain' })
  @ApiConflictResponse({ description: 'Action unavailable, or the request changed concurrently' })
  act(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PerformActionDto,
  ): Promise<void> {
    return this.commandBus.execute(
      new PerformApprovalActionCommand(id, user.id, dto.actionType, dto.comment),
    );
  }
}
