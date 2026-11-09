import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/auth.decorators';
import { PointsService } from './points.service';

@ApiTags('points')
@ApiBearerAuth()
@Controller('me/points')
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get()
  async summary(@CurrentUser() user: AuthUser) {
    return { balance: await this.points.balance(user.id) };
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.points.history(user.id, cursor);
  }
}
