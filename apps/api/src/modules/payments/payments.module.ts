import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockPaymentProvider } from './mock.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TossPaymentProvider } from './toss.provider';

@Module({
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => (c.get('PAYMENT_PROVIDER') === 'TOSS' ? new TossPaymentProvider(c.getOrThrow('TOSS_SECRET_KEY')) : new MockPaymentProvider()),
    },
  ],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
