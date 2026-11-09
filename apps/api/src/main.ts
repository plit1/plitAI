import 'reflect-metadata';
import './config/database-url';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function main() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  if (process.env.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('PLIT API').setVersion('1.0').addBearerAuth().build());
    SwaggerModule.setup('api/docs', app, doc);
  }
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4000));
}
main();
