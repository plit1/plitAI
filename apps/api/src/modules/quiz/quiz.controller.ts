import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { QuizItemStatus } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, Length, Min } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { QuizService } from './quiz.service';

class SubmitDto { @ApiProperty({ example: { itemId: 1 } }) @IsObject() answers: Record<string, number>; }
class ItemDto {
  @ApiProperty() @IsString() certId: string;
  @ApiProperty() @IsString() subject: string;
  @ApiProperty() @IsString() @Length(5, 1000) prompt: string;
  @ApiProperty() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(5) @IsString({ each: true }) options: string[];
  @ApiProperty() @IsInt() @Min(0) answer: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 2000) explanation?: string;
  @ApiProperty({ description: '출처 (자체 제작, 기관 공개 문제 등)' }) @IsString() @Length(2, 200) source: string;
  @ApiPropertyOptional({ enum: QuizItemStatus }) @IsOptional() @IsEnum(QuizItemStatus) status?: QuizItemStatus;
}
class ItemPatchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(5, 1000) prompt?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(5) @IsString({ each: true }) options?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) answer?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() explanation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 200) source?: string;
  @ApiPropertyOptional({ enum: QuizItemStatus }) @IsOptional() @IsEnum(QuizItemStatus) status?: QuizItemStatus;
}
class ListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() certId?: string;
  @ApiPropertyOptional({ enum: QuizItemStatus }) @IsOptional() @IsEnum(QuizItemStatus) status?: QuizItemStatus;
}

@ApiTags('quiz')
@ApiBearerAuth()
@Controller()
export class QuizController {
  constructor(private readonly quiz: QuizService) {}

  @Post('enrollments/:id/quiz') start(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.quiz.start(u.id, id); }
  @Get('enrollments/:id/quiz/history') history(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.quiz.history(u.id, id); }
  @Get('quiz-attempts/:id') view(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.quiz.view(id, u.id); }
  @HttpCode(200) @Post('quiz-attempts/:id/submit') submit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SubmitDto) { return this.quiz.submit(u.id, id, dto.answers); }

  @Roles('OPERATOR') @Get('admin/quiz-items') list(@Query() q: ListQuery) { return this.quiz.adminList(q.certId, q.status); }
  @Roles('OPERATOR') @Post('admin/quiz-items') create(@CurrentUser() u: AuthUser, @Body() dto: ItemDto, @Req() r: Request) { return this.quiz.adminCreate(u.id, dto, r.ip); }
  @Roles('OPERATOR') @Patch('admin/quiz-items/:id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ItemPatchDto, @Req() r: Request) { return this.quiz.adminUpdate(u.id, id, dto, r.ip); }
}
