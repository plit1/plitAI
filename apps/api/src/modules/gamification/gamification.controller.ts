import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { GamificationService } from './gamification.service';

class AdoptDto { @ApiProperty({ enum: ['DOG', 'CAT'] }) @IsIn(['DOG', 'CAT']) species: string; @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) name?: string; }
class UpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) name?: string;
  @ApiPropertyOptional({ enum: ['DOG', 'CAT'] }) @IsOptional() @IsString() species?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() costume?: string;
}

@ApiTags('gamification')
@ApiBearerAuth()
@Controller()
export class GamificationController {
  constructor(private readonly svc: GamificationService) {}
  @Get('me/mate') view(@CurrentUser() u: AuthUser) { return this.svc.view(u.id); }
  @Post('me/mate') adopt(@CurrentUser() u: AuthUser, @Body() dto: AdoptDto) { return this.svc.adopt(u.id, dto.species, dto.name); }
  @Patch('me/mate') update(@CurrentUser() u: AuthUser, @Body() dto: UpdateDto) { return this.svc.update(u.id, dto); }
  /** 주간 WIN 보너스 수동 실행 (6시간 주기 자동) */
  @Roles('SUPER_ADMIN') @HttpCode(200) @Post('admin/gamification/weekly-wins') weekly() { return this.svc.awardWeeklyWins(); }
}
