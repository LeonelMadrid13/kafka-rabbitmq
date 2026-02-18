import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { KafkaModule } from '@app/kafka';
import { RabbitmqModule } from '@app/rabbitmq';
import { TaskApiModule } from './task-api/task-api.module';

@Module({
  imports: [KafkaModule, RabbitmqModule, TaskApiModule, ConfigModule.forRoot()],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
