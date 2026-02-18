import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule } from '@app/kafka';
import { RabbitmqModule } from '@app/rabbitmq';
import { RecoveryModule } from './recovery.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    KafkaModule,
    RabbitmqModule,
    RecoveryModule,
  ],
})
export class AppModule {}
