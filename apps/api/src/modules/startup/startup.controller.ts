import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth.decorators';
import { STARTUP_PROVIDERS, StartupService } from './startup.service';

class Q {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() industry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() stage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional({ enum: ['match', 'deadline'] }) @IsOptional() @IsIn(['match', 'deadline']) sort?: 'match' | 'deadline';
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeClosed?: boolean;
}
class ProfileDto {
  @ApiPropertyOptional({ nullable: true, description: 'null = 자격증 기반 추천 업종 사용' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() industry: string | null;
  @ApiProperty() @IsString() @Length(0, 10) sido: string;
  @ApiProperty() @IsString() @Length(0, 20) sigungu: string;
  @ApiProperty() @IsString() stage: string;
  @ApiProperty() @IsString() @Length(0, 30) budget: string;
}
class TaskDto { @ApiProperty() @IsBoolean() done: boolean; }
class ProgramDto {
  @ApiProperty() @IsString() @Length(2, 100) title: string;
  @ApiProperty() @IsString() @Length(2, 60) agency: string;
  @ApiProperty({ example: '전국' }) @IsString() region: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 20) sigungu?: string;
  @ApiProperty() @IsArray() @ArrayMaxSize(3) @IsString({ each: true }) targetStages: string[];
  @ApiProperty() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) industries: string[];
  @ApiProperty() @IsString() supportType: string;
  @ApiPropertyOptional() @IsOptional() @IsString() applyStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() applyEnd?: string;
  @ApiProperty() @IsString() @Length(2, 1000) eligibility: string;
  @ApiProperty() @IsString() @Length(2, 3000) summary: string;
  @ApiProperty() @IsString() sourceUrl: string;
}
class StatusDto { @ApiProperty({ enum: ['ACTIVE', 'HIDDEN'] }) @IsIn(['ACTIVE', 'HIDDEN']) status: 'ACTIVE' | 'HIDDEN'; }
class MapDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() industry: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 100) reason?: string;
}

@ApiTags('startup')
@Controller()
export class StartupController {
  constructor(private readonly svc: StartupService, private readonly config: ConfigService) {}

  @Public() @Get('startup/meta') meta() { return this.svc.meta(); }
  @Public() @Get('startup/programs') list(@Query() q: Q, @CurrentUser() u?: AuthUser) { return this.svc.programs(u?.id, q); }
  @Public() @Get('startup/programs/:id') one(@Param('id') id: string, @CurrentUser() u?: AuthUser) { return this.svc.program(id, u?.id); }
  @ApiBearerAuth() @Put('startup/programs/:id/save') save(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.setSaved(u.id, id, true); }
  @ApiBearerAuth() @Delete('startup/programs/:id/save') unsave(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.setSaved(u.id, id, false); }
  @ApiBearerAuth() @Get('me/startup/saved') saved(@CurrentUser() u: AuthUser) { return this.svc.saved(u.id); }
  @ApiBearerAuth() @Get('me/startup-profile') profile(@CurrentUser() u: AuthUser) { return this.svc.profile(u.id); }
  @ApiBearerAuth() @Put('me/startup-profile') saveProfile(@CurrentUser() u: AuthUser, @Body() dto: ProfileDto) { return this.svc.saveProfile(u.id, { ...dto, industry: dto.industry ?? null }); }
  @ApiBearerAuth() @Put('me/startup-profile/roadmap/:taskId') task(@CurrentUser() u: AuthUser, @Param('taskId') t: string, @Body() dto: TaskDto) { return this.svc.setTask(u.id, t, dto.done); }

  @Roles('OPERATOR') @Get('admin/startup/programs') adminList() { return this.svc.adminList(); }
  @Roles('OPERATOR') @Get('admin/startup/providers') providers() { return STARTUP_PROVIDERS({ KSTARTUP_SERVICE_KEY: this.config.get('KSTARTUP_SERVICE_KEY') }); }
  @Roles('OPERATOR') @Post('admin/startup/programs') create(@CurrentUser() u: AuthUser, @Body() dto: ProgramDto, @Req() r: Request) { return this.svc.adminCreate(u.id, dto, r.ip); }
  @Roles('OPERATOR') @Patch('admin/startup/programs/:id') status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StatusDto, @Req() r: Request) { return this.svc.adminSetStatus(u.id, id, dto.status, r.ip); }
  @Roles('OPERATOR') @Get('admin/startup/industry-map') map() { return this.svc.adminMap(); }
  @Roles('OPERATOR') @Put('admin/startup/industry-map/:certId') setMap(@CurrentUser() u: AuthUser, @Param('certId') id: string, @Body() dto: MapDto, @Req() r: Request) {
    return this.svc.adminSetMap(u.id, id, dto.industry ? { industry: dto.industry, reason: dto.reason?.trim() || '관리자 지정' } : null, r.ip);
  }
}
