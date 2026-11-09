import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Length, Min } from 'class-validator';
import { createHash } from 'crypto';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { PaymentsService } from './payments.service';

class CreateOrderDto { @ApiProperty() @IsString() @Length(1, 100) offeringId: string; }
class ConfirmDto {
  @ApiProperty() @IsString() @Length(5, 64) orderNo: string;
  @ApiProperty() @IsString() @Length(5, 200) paymentKey: string;
  @ApiProperty() @IsInt() @Min(0) amount: number;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth() @Post('orders')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateOrderDto) { return this.payments.createOrder(u.id, dto.offeringId); }

  @ApiBearerAuth() @HttpCode(200) @Post('confirm')
  confirm(@CurrentUser() u: AuthUser, @Body() dto: ConfirmDto) { return this.payments.confirm(u.id, dto); }

  @ApiBearerAuth() @HttpCode(200) @Post('orders/:orderNo/refund')
  refund(@CurrentUser() u: AuthUser, @Param('orderNo') orderNo: string) { return this.payments.requestRefund(u.id, orderNo); }

  @ApiBearerAuth() @Get('me/orders')
  orders(@CurrentUser() u: AuthUser) { return this.payments.myOrders(u.id); }

  @ApiBearerAuth() @Get('me/passes')
  passes(@CurrentUser() u: AuthUser) { return this.payments.myPasses(u.id); }

  /** 토스 웹훅 (PAYMENT_STATUS_CHANGED). 본문을 신뢰하지 않고 조회 API 로 재검증 */
  @Public() @HttpCode(200) @Post('webhooks/toss')
  webhook(@Body() body: any, @Headers('tosspayments-webhook-transmission-id') tid?: string) {
    const eventId = tid || createHash('sha256').update(JSON.stringify(body)).digest('hex');
    return this.payments.handleWebhook(body, eventId);
  }
}
