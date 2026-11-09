import { Module } from '@nestjs/common';
import { CertificationsController, FavoritesController } from './certifications.controller';
@Module({ controllers: [CertificationsController, FavoritesController] })
export class CertificationsModule {}
