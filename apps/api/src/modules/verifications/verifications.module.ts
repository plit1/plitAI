import { Module } from '@nestjs/common';
import { EvidenceStorage } from './evidence-storage';
import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';
@Module({ providers: [VerificationsService, EvidenceStorage], controllers: [VerificationsController] })
export class VerificationsModule {}
