import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { KafkaModule } from './kafka/kafka.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { TaskApiModule } from './task-api/task-api.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { WorkerService } from './worker/worker.service';
import { WorkerModule } from './worker/worker.module';
import { RecoveryModule } from './recovery/recovery.module';

@Module({
  imports: [
    KafkaModule,
    RabbitmqModule,
    TaskApiModule,
    DispatchModule,
    WorkerModule,
    ConfigModule.forRoot(),
    RecoveryModule,
  ],
  controllers: [AppController],
  providers: [AppService, WorkerService],
})
export class AppModule {}
