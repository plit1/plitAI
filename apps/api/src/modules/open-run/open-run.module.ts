import { Module } from '@nestjs/common';
import { OpenRunController } from './open-run.controller';
import { OpenRunService } from './open-run.service';
@Module({ providers: [OpenRunService], controllers: [OpenRunController] })
export class OpenRunModule {}
