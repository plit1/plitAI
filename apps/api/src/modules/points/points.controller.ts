import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
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

  @Get('expiring')
  expiring(@CurrentUser() user: AuthUser) { return this.points.expiringSoon(user.id, 30); }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.points.history(user.id, cursor);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/points')
export class AdminPointsController {
  constructor(private readonly points: PointsService) {}
  /** 만료 배치 수동 실행 (서버가 1시간마다도 실행) */
  @Roles('SUPER_ADMIN') @HttpCode(200) @Post('expire') expire() { return this.points.expireDue(); }
}
