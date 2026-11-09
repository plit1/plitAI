import { Global, Module } from '@nestjs/common';
import { AdminPointsController, PointsController } from './points.controller';
import { PointsService } from './points.service';

@Global()
@Module({ providers: [PointsService], controllers: [PointsController, AdminPointsController], exports: [PointsService] })
export class PointsModule {}
