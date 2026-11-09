import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { CATEGORIES } from '../community/community.service';
import { StudyRoomService } from './study-room.service';

class SendDto { @ApiProperty() @IsString() @Length(1, 1000) body: string; }
class RoomPostDto {
  @ApiProperty({ enum: CATEGORIES }) @IsIn(CATEGORIES as unknown as string[]) category: string;
  @ApiProperty() @IsString() @Length(1, 100) title: string;
  @ApiProperty() @IsString() @Length(1, 3000) body: string;
  @ApiPropertyOptional({ description: '전체 커뮤니티 공개 고지 확인' }) @IsOptional() @IsBoolean() ack?: boolean;
}
class AdminRoomDto {
  @ApiPropertyOptional({ nullable: true, description: 'ISO 일시, null 이면 종료 예약 취소' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() closeAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoShare?: boolean;
}

@ApiTags('study-room')
@ApiBearerAuth()
@Controller()
export class StudyRoomController {
  constructor(private readonly svc: StudyRoomService) {}

  @Get('study-rooms/:id') summary(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.summary(u.id, u.role, id); }
  @Get('study-rooms/:id/messages') messages(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('before') before?: string) { return this.svc.history(u.id, u.role, id, before); }
  /** WebSocket 이 안 될 때의 REST 전송 (같은 가드·방송) */
  @Post('study-rooms/:id/messages') send(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SendDto) { return this.svc.send(u.id, u.role, id, dto.body); }
  @Get('study-rooms/:id/posts') posts(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('cursor') cursor?: string) { return this.svc.posts(u.id, u.role, id, cursor); }
  @Post('study-rooms/:id/posts') post(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RoomPostDto) { return this.svc.createPost(u.id, u.role, id, dto); }

  @Roles('OPERATOR') @Patch('admin/study-rooms/:id') adminSet(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AdminRoomDto, @Req() r: Request) { return this.svc.adminSet(u.id, id, dto, r.ip); }
  @Roles('SUPER_ADMIN') @HttpCode(200) @Post('admin/study-rooms/purge') purge() { return this.svc.purgeDue(); }
}
