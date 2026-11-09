import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth.decorators';
import { ExamScheduleService } from './exam-schedule.service';

class RoundDto {
  @ApiProperty() @IsString() certId: string;
  @ApiProperty({ example: '2027년 1회' }) @IsString() @Length(1, 50) label: string;
  @ApiPropertyOptional() @IsOptional() @IsString() applyStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() applyEnd?: string;
  @ApiProperty({ example: '2027-03-01' }) @IsString() examDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resultDate?: string;
}
class ImportDto {
  @ApiProperty({ description: 'CSV 본문 (헤더: certId,label,applyStart,applyEnd,examDate,resultDate)' }) @IsString() @Length(1, 1_000_000) csv: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() dryRun?: boolean;
}

@ApiTags('exam-schedule')
@Controller()
export class ExamScheduleController {
  constructor(private readonly svc: ExamScheduleService) {}

  /** 공개: 자격증별 공식 시험 일정 */
  @Public() @Get('certifications/:id/exam-rounds') forCert(@Param('id') id: string) { return this.svc.list(id); }

  @ApiBearerAuth() @Roles('OPERATOR') @Get('admin/exam-rounds') list(@Query('certId') certId?: string) { return this.svc.list(certId); }
  @ApiBearerAuth() @Roles('OPERATOR') @Get('admin/exam-rounds/providers') providers() { return this.svc.providers(); }
  @ApiBearerAuth() @Roles('OPERATOR') @Post('admin/exam-rounds')
  upsert(@CurrentUser() u: AuthUser, @Body() dto: RoundDto, @Req() req: Request) { return this.svc.upsertOne(u.id, dto, req.ip); }
  @ApiBearerAuth() @Roles('OPERATOR') @HttpCode(204) @Delete('admin/exam-rounds/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string, @Req() req: Request) { return this.svc.remove(u.id, id, req.ip); }
  @ApiBearerAuth() @Roles('OPERATOR') @HttpCode(200) @Post('admin/exam-rounds/import')
  importCsv(@CurrentUser() u: AuthUser, @Body() dto: ImportDto, @Req() req: Request) { return this.svc.importCsv(u.id, dto.csv, dto.dryRun ?? true, req.ip); }
}
