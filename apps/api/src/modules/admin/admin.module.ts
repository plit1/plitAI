import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { AdminController } from './admin.controller';
@Module({ imports: [PaymentsModule], controllers: [AdminController] })
export class AdminModule {}
