import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { AiCoachService } from './ai-coach.service';
import { StrategyService } from './strategy.service';

@ApiTags('strategy')
@ApiBearerAuth()
@Controller()
export class StrategyController {
  constructor(private readonly svc: StrategyService, private readonly coach: AiCoachService) {}

  @Get('enrollments/:id/strategy') view(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.view(u.id, id); }
  @HttpCode(200) @Post('enrollments/:id/strategy/apply') apply(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.apply(u.id, id); }
  @HttpCode(200) @Post('enrollments/:id/clear-mode') clear(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.startClearMode(u.id, id); }
  @HttpCode(200) @Post('enrollments/:id/coach') coachMsg(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.coach(u.id, id); }

  @Roles('OPERATOR') @Get('admin/ai-usage') usage(@Query('days') days?: string) { return this.coach.usageSummary(Math.min(365, Math.max(1, Number(days) || 30))); }
}
