import { Global, Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';

@Global()
@Module({ providers: [ChallengesService], controllers: [ChallengesController], exports: [ChallengesService] })
export class ChallengesModule {}
