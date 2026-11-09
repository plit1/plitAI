import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth.decorators';
import { EVENT_TYPES } from './ads.rules';
import { AdsService } from './ads.service';

const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
class EventDto {
  @ApiProperty() @IsString() campaignId: string;
  @ApiProperty({ enum: EVENT_TYPES }) @IsIn(EVENT_TYPES) eventType: string;
  @ApiProperty() @Matches(SESSION) sessionId: string;
  @ApiProperty() @IsString() @Length(1, 40) placement: string;
}
class Answers { @ApiProperty() @IsString() @Length(1, 60) topic: string; @ApiPropertyOptional() @IsOptional() @IsString() certId?: string; }
class LeadDto {
  @ApiProperty() @ValidateNested() @Type(() => Answers) answers: Answers;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsBoolean() consentPrivacy: boolean;
  @ApiProperty() @IsBoolean() consentThirdParty: boolean;
  @ApiProperty() @Matches(SESSION) sessionId: string;
  @ApiProperty() @IsString() @Length(1, 40) placement: string;
}
class CampaignDto {
  @ApiProperty() @IsString() category: string;
  @ApiProperty() @IsString() @Length(2, 40) advertiserName: string;
  @ApiProperty() @IsString() @Length(2, 60) title: string;
  @ApiProperty() @IsString() @Length(2, 200) description: string;
  @ApiProperty() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) detail: string[];
  @ApiProperty() @IsString() @Length(2, 20) ctaText: string;
  @ApiProperty() @IsInt() cpaPrice: number;
  @ApiProperty() @IsArray() @IsString({ each: true }) targetFields: string[];
  @ApiProperty() @IsArray() @IsString({ each: true }) topics: string[];
  @ApiProperty() @IsBoolean() collectsContact: boolean;
}
class StatusDto { @ApiProperty() @IsIn(['PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'REJECTED', 'ENDED']) status: 'ACTIVE'; @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) note?: string; }
class PriceDto { @ApiProperty() @IsInt() cpaPrice: number; }
class DecideDto { @ApiProperty() @IsIn(['APPROVE', 'REJECT', 'REVERSE']) action: 'APPROVE' | 'REJECT' | 'REVERSE'; @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) note?: string; }

@ApiTags('ads')
@Controller()
export class AdsController {
  constructor(private readonly svc: AdsService) {}
  @Public() @Get('ads/feed') feed(@Query('field') field?: string) { return this.svc.feed(field); }
  @Public() @Get('ads/:id') one(@Param('id') id: string) { return this.svc.campaign(id); }
  @Public() @Throttle({ default: { limit: 120, ttl: 60_000 } }) @Post('ads/events') event(@Body() dto: EventDto, @CurrentUser() u?: AuthUser) { return this.svc.event(dto, u?.id); }
  @ApiBearerAuth() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('ads/:id/leads') lead(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: LeadDto) { return this.svc.submitLead(u.id, id, dto); }

  @Roles('OPERATOR') @Get('admin/ads/campaigns') list() { return this.svc.adminCampaigns(); }
  @Roles('OPERATOR') @Post('admin/ads/campaigns') create(@CurrentUser() u: AuthUser, @Body() dto: CampaignDto, @Req() r: Request) { return this.svc.adminCreate(u.id, dto, r.ip); }
  @Roles('OPERATOR') @Patch('admin/ads/campaigns/:id/status') status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StatusDto, @Req() r: Request) { return this.svc.adminSetStatus(u.id, id, dto.status, dto.note, r.ip); }
  @Roles('SUPER_ADMIN') @Patch('admin/ads/campaigns/:id/price') price(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PriceDto, @Req() r: Request) { return this.svc.adminSetPrice(u.id, id, dto.cpaPrice, r.ip); }
  @Roles('OPERATOR') @Get('admin/ads/leads') leads(@Query('campaignId') c?: string, @Query('status') s?: string) { return this.svc.adminLeads(c, s); }
  @Roles('OPERATOR') @Post('admin/ads/leads/:id/decide') decide(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DecideDto, @Req() r: Request) { return this.svc.adminDecideLead(u.id, id, dto.action, dto.note, r.ip); }
}
