import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule } from '@app/kafka';
import { RabbitmqModule } from '@app/rabbitmq';
import { DispatchModule } from './dispatch.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    KafkaModule,
    RabbitmqModule,
    DispatchModule,
  ],
})
export class AppModule {}
