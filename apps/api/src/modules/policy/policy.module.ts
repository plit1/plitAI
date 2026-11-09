import { Global, Module } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyController } from './policy.controller';

@Global()
@Module({ providers: [PolicyService], controllers: [PolicyController], exports: [PolicyService] })
export class PolicyModule {}
