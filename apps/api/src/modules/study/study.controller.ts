import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/auth.decorators';
import { StudyService } from './study.service';

@ApiTags('study')
@ApiBearerAuth()
@Controller()
export class StudyController {
  constructor(private readonly study: StudyService) {}

  @Get('enrollments/:id/dashboard') dashboard(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.study.dashboard(u.id, id); }
  @Post('enrollments/:id/sessions') start(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.study.start(u.id, id); }
  @HttpCode(200) @Post('sessions/:id/pause') pause(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.study.pause(u.id, id); }
  @HttpCode(200) @Post('sessions/:id/resume') resume(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.study.resume(u.id, id); }
  @HttpCode(200) @Post('sessions/:id/complete') complete(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.study.complete(u.id, id); }
  @HttpCode(200) @Post('sessions/:id/cancel') cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.study.cancel(u.id, id); }
}
