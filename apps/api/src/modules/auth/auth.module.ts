import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { MfaService } from './mfa.service';
import { OAuthService } from './oauth.service';
import { TokenService } from './token.service';

@Global()
@Module({ providers: [AuthService, TokenService, OAuthService, MailService, MfaService], controllers: [AuthController], exports: [AuthService, TokenService, MailService, MfaService, OAuthService] })
export class AuthModule {}
