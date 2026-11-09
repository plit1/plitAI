import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StudyModule } from '../study/study.module';
import { AI_CLIENT, createAiClient } from './ai.client';
import { AiCoachService } from './ai-coach.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';

@Module({
  imports: [StudyModule],
  providers: [StrategyService, AiCoachService, { provide: AI_CLIENT, inject: [ConfigService], useFactory: (c: ConfigService) => createAiClient(c.get('ANTHROPIC_API_KEY')) }],
  controllers: [StrategyController],
})
export class StrategyModule {}
