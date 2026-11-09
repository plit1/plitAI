import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createStorage, OBJECT_STORAGE } from './storage';

@Global()
@Module({ providers: [{ provide: OBJECT_STORAGE, inject: [ConfigService], useFactory: (c: ConfigService) => createStorage({ STORAGE_DRIVER: c.get('STORAGE_DRIVER'), S3_UPLOAD_BUCKET: c.get('S3_UPLOAD_BUCKET'), AWS_REGION: c.get('AWS_REGION'), S3_KMS_KEY_ID: c.get('S3_KMS_KEY_ID'), UPLOAD_DIR: process.env.UPLOAD_DIR }) }], exports: [OBJECT_STORAGE] })
export class StorageModule {}
