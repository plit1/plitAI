import { Module } from '@nestjs/common';
import { StudyModule } from '../study/study.module';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
@Module({ imports: [StudyModule], providers: [GamificationService], controllers: [GamificationController] })
export class GamificationModule {}
