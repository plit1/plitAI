import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth.decorators';
import { ReferralService } from './referral.service';

class ApproveDto { @ApiProperty({ required: false }) @IsOptional() @IsBoolean() overrideDup?: boolean; @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(2, 200) note?: string; }
class RejectDto { @ApiProperty() @IsString() @Length(2, 200) reason: string; }

@ApiTags('referral')
@Controller()
export class ReferralController {
  constructor(private readonly svc: ReferralService, private readonly config: ConfigService) {}
  @ApiBearerAuth() @Get('me/referral') me(@CurrentUser() u: AuthUser) { return this.svc.summary(u.id, this.config.get<string>('APP_ORIGIN') ?? 'http://localhost:3000'); }
  @Public() @Get('referral/:code') landing(@Param('code') code: string) { return this.svc.landing(code); }
  @Roles('OPERATOR') @Get('admin/referral/rewards') list(@Query('status') status?: 'PENDING' | 'REWARDED' | 'REJECTED') { return this.svc.adminList(status); }
  @Roles('OPERATOR') @Post('admin/referral/rewards/:id/approve') approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ApproveDto, @Req() r: Request) { return this.svc.approve(u.id, id, r.ip, dto); }
  @Roles('OPERATOR') @Post('admin/referral/rewards/:id/reject') reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RejectDto, @Req() r: Request) { return this.svc.reject(u.id, id, dto.reason, r.ip); }
}
