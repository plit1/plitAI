import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth.decorators';
import { JOB_PROVIDERS, JobsService } from './jobs.service';

class Q {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employment?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['NEW', 'EXP', 'ANY']) experience?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() certId?: string;
  @ApiPropertyOptional({ enum: ['match', 'deadline', 'recent'] }) @IsOptional() @IsIn(['match', 'deadline', 'recent']) sort?: 'match' | 'deadline' | 'recent';
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeClosed?: boolean;
}
class ProfileDto {
  @ApiProperty() @IsArray() @ArrayMaxSize(17) @IsString({ each: true }) regions: string[];
  @ApiProperty() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) roles: string[];
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(['NEW', 'EXP', 'ANY']) experience: string | null;
  @ApiProperty() @IsArray() @IsString({ each: true }) employment: string[];
}
class JobDto {
  @ApiProperty() @IsString() @Length(1, 60) companyName: string;
  @ApiProperty() @IsString() @Length(2, 100) title: string;
  @ApiProperty() @IsString() @Length(5, 3000) description: string;
  @ApiProperty({ example: '경기 화성' }) @IsString() @Length(2, 60) workLocation: string;
  @ApiProperty() @IsString() employmentType: string;
  @ApiProperty({ enum: ['NEW', 'EXP', 'ANY'] }) @IsString() experience: string;
  @ApiPropertyOptional() @IsOptional() @IsString() education?: string;
  @ApiProperty() @IsArray() @IsString({ each: true }) requiredCerts: string[];
  @ApiProperty() @IsArray() @IsString({ each: true }) preferredCerts: string[];
  @ApiProperty() @IsArray() @IsString({ each: true }) categories: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() salary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiresAt?: string;
  @ApiProperty() @IsString() originalUrl: string;
}
class StatusDto { @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) @IsIn(['ACTIVE', 'ARCHIVED']) status: 'ACTIVE' | 'ARCHIVED'; }
class MapDto { @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) keywords: string[] | null; }

@ApiTags('jobs')
@Controller()
export class JobsController {
  constructor(private readonly svc: JobsService, private readonly config: ConfigService) {}

  @Public() @Get('jobs') search(@Query() q: Q, @CurrentUser() u?: AuthUser) { return this.svc.search(u?.id, q); }
  @ApiBearerAuth() @Get('jobs/recommended') rec(@CurrentUser() u: AuthUser) { return this.svc.recommended(u.id); }
  @Public() @Get('jobs/:id') detail(@Param('id') id: string, @CurrentUser() u?: AuthUser) { return this.svc.detail(id, u?.id); }
  @ApiBearerAuth() @Put('jobs/:id/save') save(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.setSaved(u.id, id, true); }
  @ApiBearerAuth() @Delete('jobs/:id/save') unsave(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.setSaved(u.id, id, false); }
  @ApiBearerAuth() @Get('me/jobs/saved') saved(@CurrentUser() u: AuthUser) { return this.svc.saved(u.id); }
  @ApiBearerAuth() @Get('me/job-profile') profile(@CurrentUser() u: AuthUser) { return this.svc.profile(u.id); }
  @ApiBearerAuth() @Put('me/job-profile') saveProfile(@CurrentUser() u: AuthUser, @Body() dto: ProfileDto) { return this.svc.saveProfile(u.id, dto); }
  @ApiBearerAuth() @Put('me/cert-claims/:certId') claim(@CurrentUser() u: AuthUser, @Param('certId') id: string) { return this.svc.claim(u.id, id, true); }
  @ApiBearerAuth() @Delete('me/cert-claims/:certId') unclaim(@CurrentUser() u: AuthUser, @Param('certId') id: string) { return this.svc.claim(u.id, id, false); }

  @Roles('OPERATOR') @Get('admin/jobs') adminList() { return this.svc.adminList(); }
  @Roles('OPERATOR') @Get('admin/jobs/providers') providers() { return JOB_PROVIDERS({ WORK24_API_KEY: this.config.get('WORK24_API_KEY') }); }
  @Roles('OPERATOR') @Post('admin/jobs') create(@CurrentUser() u: AuthUser, @Body() dto: JobDto, @Req() r: Request) { return this.svc.adminCreate(u.id, dto, r.ip); }
  @Roles('OPERATOR') @Patch('admin/jobs/:id') status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StatusDto, @Req() r: Request) { return this.svc.adminSetStatus(u.id, id, dto.status, r.ip); }
  @Roles('OPERATOR') @Put('admin/job-map/:certId') map(@CurrentUser() u: AuthUser, @Param('certId') id: string, @Body() dto: MapDto, @Req() r: Request) { return this.svc.adminSetMap(u.id, id, dto.keywords ?? null, r.ip); }
}
