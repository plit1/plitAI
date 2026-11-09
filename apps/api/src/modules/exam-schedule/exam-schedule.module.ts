import { Module } from '@nestjs/common';
import { ExamScheduleController } from './exam-schedule.controller';
import { ExamScheduleService } from './exam-schedule.service';
@Module({ providers: [ExamScheduleService], controllers: [ExamScheduleController] })
export class ExamScheduleModule {}
