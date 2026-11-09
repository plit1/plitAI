import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { ModerationService } from './moderation.service';
@Module({ providers: [CommunityService, ModerationService], controllers: [CommunityController], exports: [CommunityService, ModerationService] })
export class CommunityModule {}
