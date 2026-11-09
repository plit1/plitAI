import { Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { Roles } from '../../common/auth.decorators';
import { PaymentsService } from '../payments/payments.service';
import { SettlementService } from './settlement.service';

class RangeDto {
  @ApiPropertyOptional({ example: '2026-11-01' }) @IsString() from: string;
  @ApiPropertyOptional({ example: '2026-11-30' }) @IsString() to: string;
  @ApiPropertyOptional({ enum: ['day', 'month'] }) @IsOptional() @IsIn(['day', 'month']) by?: 'day' | 'month';
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeTest?: boolean;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('OPERATOR')
@Controller('admin/settlement')
export class SettlementController {
  constructor(private readonly svc: SettlementService, private readonly payments: PaymentsService) {}

  @Get('revenue') revenue(@Query() q: RangeDto) { return this.svc.revenue({ ...q, by: q.by ?? 'day' }); }
  @Get('points') points(@Query() q: RangeDto) { return this.svc.points({ ...q, by: q.by ?? 'month' }); }

  @Get('revenue.csv')
  async csv(@Query() q: RangeDto, @Res() res: Response) {
    const body = await this.svc.revenueCsv({ ...q, by: q.by ?? 'day' });
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="plit-revenue-${q.from}_${q.to}.csv"`, 'Cache-Control': 'no-store' });
    res.send(body);
  }

  /** 대사 수동 실행 (서버가 15분마다도 실행) */
  @Roles('SUPER_ADMIN') @HttpCode(200) @Post('reconcile') reconcile() { return this.payments.reconcilePending(); }
}
