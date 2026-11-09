import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Plan } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { ChallengesService } from './challenges.service';

class JoinDto {
  @ApiProperty({ enum: Plan }) @IsEnum(Plan) plan: Plan;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(4, 16) referralCode?: string;
}
class ListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() certId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() field?: string;
  @ApiPropertyOptional({ enum: ['open', 'closed'] }) @IsOptional() @IsIn(['open', 'closed']) status?: 'open' | 'closed';
}

@ApiTags('challenges')
@Controller()
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Public() @Get('challenges')
  list(@Query() q: ListQuery) { return this.challenges.list(q); }

  @Public() @Get('challenges/:id')
  detail(@Param('id') id: string) { return this.challenges.detail(id); }

  @ApiBearerAuth() @Post('challenges/:id/join')
  join(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: JoinDto) {
    return this.challenges.join(u.id, id, dto.plan, dto.referralCode);
  }

  @ApiBearerAuth() @Get('me/enrollments')
  mine(@CurrentUser() u: AuthUser) { return this.challenges.myEnrollments(u.id); }
}
