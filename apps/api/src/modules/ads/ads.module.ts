import { Module } from '@nestjs/common';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';
@Module({ providers: [AdsService], controllers: [AdsController] })
export class AdsModule {}
