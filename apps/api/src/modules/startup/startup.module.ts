import { Module } from '@nestjs/common';
import { StartupController } from './startup.controller';
import { StartupService } from './startup.service';
@Module({ providers: [StartupService], controllers: [StartupController] })
export class StartupModule {}
