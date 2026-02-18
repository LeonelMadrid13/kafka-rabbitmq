import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule } from '@app/kafka';
import { RabbitmqModule } from '@app/rabbitmq';
import { WorkerModule } from './worker.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    KafkaModule,
    RabbitmqModule,
    WorkerModule, // ONLY the Worker
  ],
})
export class AppModule {}
