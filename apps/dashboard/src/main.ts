import { NestFactory } from '@nestjs/core';
import { DashboardModule } from './dashboard.module';

async function bootstrap() {
  const app = await NestFactory.create(DashboardModule);

  // Enable CORS for WebSocket
  app.enableCors();

  await app.listen(4000);
  console.log('🎯 Dashboard running on http://localhost:4000');
}
bootstrap();
