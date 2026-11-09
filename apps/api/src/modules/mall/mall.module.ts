import { Module } from '@nestjs/common';
import { MallController } from './mall.controller';
import { MallService } from './mall.service';
@Module({ providers: [MallService], controllers: [MallController] })
export class MallModule {}
