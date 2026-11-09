import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
@Module({ imports: [PaymentsModule], providers: [SettlementService], controllers: [SettlementController] })
export class SettlementModule {}
