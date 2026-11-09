import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { OpenRunStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth.decorators';
import { FIELDS } from '../certifications/certifications.controller';
import { OpenRunAction, OpenRunService } from './open-run.service';

class CreateDto {
  @ApiProperty({ example: '보세사' }) @IsString() @Length(2, 60) title: string;
  @ApiProperty({ enum: FIELDS.map((f) => f.id) }) @IsIn(FIELDS.map((f) => f.id)) category: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 30) round?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 300) reason?: string;
}
class InterestDto { @ApiPropertyOptional() @IsOptional() @IsBoolean() notify?: boolean; }
class ListQuery {
  @ApiPropertyOptional({ enum: OpenRunStatus }) @IsOptional() @IsEnum(OpenRunStatus) status?: OpenRunStatus;
  @ApiPropertyOptional({ enum: ['popular', 'recent'] }) @IsOptional() @IsIn(['popular', 'recent']) sort?: 'popular' | 'recent';
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60) q?: string;
}
class ReviewDto {
  @ApiProperty({ enum: ['APPROVE', 'START_REVIEW', 'REJECT', 'OPEN'] }) @IsIn(['APPROVE', 'START_REVIEW', 'REJECT', 'OPEN']) action: OpenRunAction;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 300) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() offeringId?: string;
}

@ApiTags('open-run')
@Controller()
export class OpenRunController {
  constructor(private readonly svc: OpenRunService) {}

  @Public() @Get('open-run') list(@Query() q: ListQuery) { return this.svc.list(q); }
  @Public() @Get('open-run/:id') detail(@Param('id') id: string, @CurrentUser() u?: AuthUser) { return this.svc.detail(id, u?.id); }

  @ApiBearerAuth() @Post('open-run') create(@CurrentUser() u: AuthUser, @Body() dto: CreateDto) { return this.svc.create(u.id, dto); }
  @ApiBearerAuth() @Put('open-run/:id/interest') interest(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: InterestDto) { return this.svc.setInterest(u.id, id, true, dto.notify ?? true); }
  @ApiBearerAuth() @Delete('open-run/:id/interest') uninterest(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.setInterest(u.id, id, false); }
  @ApiBearerAuth() @Get('me/open-run') mine(@CurrentUser() u: AuthUser) { return this.svc.mine(u.id); }

  @Roles('OPERATOR') @Get('admin/open-run') adminList(@Query() q: ListQuery) { return this.svc.adminList(q.status); }
  @Roles('OPERATOR') @Post('admin/open-run/:id/review')
  review(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto, @Req() req: Request) { return this.svc.review(u.id, id, dto.action, { note: dto.note, offeringId: dto.offeringId, ip: req.ip }); }
}
