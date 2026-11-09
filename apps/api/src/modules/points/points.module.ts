import { Global, Module } from '@nestjs/common';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';

@Global()
@Module({ providers: [PointsService], controllers: [PointsController], exports: [PointsService] })
export class PointsModule {}
