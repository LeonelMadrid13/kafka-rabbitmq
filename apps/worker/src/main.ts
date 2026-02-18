import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.init();  // No HTTP server!
  console.log('👷 Worker Service started');
}
bootstrap();
