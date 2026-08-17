import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserDto } from './dto/user.dto';
import { GetUserProfileQuery } from './queries/get-user-profile.query';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired access token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return this.queryBus.execute(new GetUserProfileQuery(user.id));
  }
}
