import { Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { VerificationStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { AppError } from '../../common/errors';
import { EVIDENCE_MAX_BYTES, EvidenceStorage } from './evidence-storage';
import { ReviewDecision, VerificationsService } from './verifications.service';

class SubmitDto {
  @ApiProperty() @IsString() @Matches(/^[0-9A-Za-z\- ]{4,30}$/, { message: '수험번호 형식을 확인해주세요.' }) examNumber: string;
  @ApiProperty() @IsString() @Length(10, 200) evidenceKey: string;
  @ApiPropertyOptional({ description: '공식 시험 회차(ExamRound) ID' }) @IsOptional() @IsString() examRoundId?: string;
}
class AppealDto { @ApiProperty() @IsString() @Length(5, 500) reason: string; }
class ReviewDto {
  @ApiProperty({ enum: ['APPROVE', 'NEEDS_FIX', 'FAIL', 'REJECT'] }) @IsIn(['APPROVE', 'NEEDS_FIX', 'FAIL', 'REJECT']) decision: ReviewDecision;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 500) note?: string;
}
class QueueQuery { @ApiPropertyOptional({ enum: VerificationStatus }) @IsOptional() @IsEnum(VerificationStatus) status?: VerificationStatus; }

@ApiTags('verifications')
@ApiBearerAuth()
@Controller()
export class VerificationsController {
  constructor(private readonly svc: VerificationsService, private readonly storage: EvidenceStorage) {}

  @Post('uploads/evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: EVIDENCE_MAX_BYTES, files: 1 } }))
  async upload(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppError('FILE_REQUIRED', '파일을 선택해주세요.');
    return this.storage.save(u.id, file.buffer);
  }

  @Get('enrollments/:id/verification') mine(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.mine(u.id, id); }
  @Post('enrollments/:id/verification') submit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SubmitDto) { return this.svc.submit(u.id, id, dto); }
  @Post('enrollments/:id/verification/appeal') appeal(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AppealDto) { return this.svc.appeal(u.id, id, dto.reason); }

  @Roles('OPERATOR') @Get('admin/verifications')
  queue(@Query() q: QueueQuery) { return this.svc.queue(q.status); }

  /** 심사용 증빙 열람 — 캐시 금지·인라인·MIME 스니핑 금지, 열람 감사 로그 */
  @Roles('OPERATOR') @Get('admin/verifications/:id/evidence')
  async evidence(@CurrentUser() u: AuthUser, @Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const file = await this.svc.evidenceFor(u.id, id, (k) => this.storage.read(k), req.ip);
    res.set({ 'Content-Type': file.contentType, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" });
    res.send(file.body);
  }

  @Roles('OPERATOR') @Post('admin/verifications/:id/review')
  review(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto, @Req() req: Request) { return this.svc.review(u.id, id, dto.decision, dto.note, req.ip); }
}
