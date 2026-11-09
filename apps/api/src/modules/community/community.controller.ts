import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ReportStatus, ReportTarget } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth.decorators';
import { PrismaService } from '../../common/prisma.service';
import { CATEGORIES, CommunityService } from './community.service';
import { ModerationService } from './moderation.service';

class PostDto {
  @ApiProperty({ enum: CATEGORIES }) @IsIn(CATEGORIES as unknown as string[]) category: string;
  @ApiProperty() @IsString() @Length(1, 100) title: string;
  @ApiProperty() @IsString() @Length(1, 3000) body: string;
  @ApiPropertyOptional() @IsOptional() @IsString() certId?: string;
}
class CommentDto { @ApiProperty() @IsString() @Length(1, 1000) body: string; }
class ReportDto {
  @ApiProperty({ enum: ReportTarget }) @IsEnum(ReportTarget) targetType: ReportTarget;
  @ApiProperty() @IsString() targetId: string;
  @ApiProperty() @IsString() @Length(2, 200) reason: string;
}
class ListQuery {
  @ApiPropertyOptional({ enum: CATEGORIES }) @IsOptional() @IsIn(CATEGORIES as unknown as string[]) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() certId?: string;
  @ApiPropertyOptional({ enum: ['recent', 'popular'] }) @IsOptional() @IsIn(['recent', 'popular']) sort?: 'recent' | 'popular';
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
}
class ModerateDto { @ApiProperty({ enum: ['hide', 'restore', 'dismiss'] }) @IsIn(['hide', 'restore', 'dismiss']) action: 'hide' | 'restore' | 'dismiss'; }
class QueueQuery { @ApiPropertyOptional({ enum: ReportStatus }) @IsOptional() @IsEnum(ReportStatus) status?: ReportStatus; }

@ApiTags('community')
@Controller()
export class CommunityController {
  constructor(private readonly svc: CommunityService, private readonly mod: ModerationService, private readonly prisma: PrismaService) {}

  /** 비공개 스터디룸 글 접근: 해당 회차 참여자만 */
  private canSeeRoom = (userId?: string) => async (roomId: string) => !!userId && !!(await this.prisma.enrollment.findFirst({ where: { userId, offeringId: roomId, status: { not: 'CANCELLED' } } }));

  @Public() @Get('community/posts') list(@Query() q: ListQuery, @CurrentUser() u?: AuthUser) { return this.svc.list(u?.id, q); }
  @Public() @Get('community/posts/:id') detail(@Param('id') id: string, @CurrentUser() u?: AuthUser) { return this.svc.detail(id, u?.id, this.canSeeRoom(u?.id)); }

  @ApiBearerAuth() @Post('community/posts') create(@CurrentUser() u: AuthUser, @Body() dto: PostDto) { return this.svc.create(u.id, dto); }
  @ApiBearerAuth() @HttpCode(204) @Delete('community/posts/:id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.remove(u.id, id); }
  @ApiBearerAuth() @Post('community/posts/:id/comments') comment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) { return this.svc.comment(u.id, id, dto.body, this.canSeeRoom(u.id)); }
  @ApiBearerAuth() @HttpCode(204) @Delete('community/comments/:id') removeComment(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.removeComment(u.id, id); }
  @ApiBearerAuth() @Put('community/posts/:id/like') like(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.setLike(u.id, id, true); }
  @ApiBearerAuth() @Delete('community/posts/:id/like') unlike(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.setLike(u.id, id, false); }

  @ApiBearerAuth() @Post('reports') report(@CurrentUser() u: AuthUser, @Body() dto: ReportDto) { return this.mod.report(u.id, dto.targetType, dto.targetId, dto.reason); }
  @ApiBearerAuth() @Get('me/blocks') blocks(@CurrentUser() u: AuthUser) { return this.mod.blocks(u.id); }
  @ApiBearerAuth() @HttpCode(204) @Put('me/blocks/:userId') block(@CurrentUser() u: AuthUser, @Param('userId') id: string) { return this.mod.block(u.id, id); }
  @ApiBearerAuth() @HttpCode(204) @Delete('me/blocks/:userId') unblock(@CurrentUser() u: AuthUser, @Param('userId') id: string) { return this.mod.unblock(u.id, id); }

  @Roles('OPERATOR') @Get('admin/reports') queue(@Query() q: QueueQuery) { return this.mod.queue(q.status); }
  @Roles('OPERATOR') @Post('admin/reports/:id/moderate') moderate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ModerateDto, @Req() r: Request) { return this.mod.moderate(u.id, id, dto.action, r.ip); }
}
