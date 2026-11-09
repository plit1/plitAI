import { Module } from '@nestjs/common';
import { StudyController } from './study.controller';
import { StudyService } from './study.service';
@Module({ providers: [StudyService], controllers: [StudyController], exports: [StudyService] })
export class StudyModule {}
