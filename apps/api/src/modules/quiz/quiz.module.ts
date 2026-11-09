import { Module } from '@nestjs/common';
import { StudyModule } from '../study/study.module';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
@Module({ imports: [StudyModule], providers: [QuizService], controllers: [QuizController], exports: [QuizService] })
export class QuizModule {}
