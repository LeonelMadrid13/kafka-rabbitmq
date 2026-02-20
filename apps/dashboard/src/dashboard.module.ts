import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule } from '@app/kafka';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    ConfigModule.forRoot(),
    KafkaModule,
    ServeStaticModule.forRoot({
      rootPath: join(
        __dirname,
        '..',
        '..',
        '..',
        'apps',
        'dashboard',
        'public',
      ),
      serveRoot: '/',
    }),
  ],
  controllers: [DashboardController],
  providers: [DashboardGateway],
})
export class DashboardModule {}
