import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';

import { Kafka, Producer, Consumer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumers: Map<string, Consumer> = new Map();

  constructor() {
    this.kafka = new Kafka({
      clientId: 'trask-processing-system',
      brokers: ['localhost:9092'],
    });

    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka Producer connected');
    } catch (error) {
      this.logger.error('Error connecting Kafka Producer', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.producer.disconnect();
      this.logger.log('Kafka Producer disconnected');

      for (const [name, consumer] of this.consumers) {
        await consumer.disconnect();
        this.logger.log(`Kafka Consumer ${name} disconnected`);
      }
    } catch (error) {
      this.logger.error('Error disconnecting Kafka', error);
    }
  }

  async publishEvent(topic: string, event: any, key?: string) {
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: key || event.taskId,
            value: JSON.stringify(event),
            timestamp: Date.now().toString(),
          },
        ],
      });
      this.logger.log(`Event published to topic ${topic}: ${event.type}`);
    } catch (error) {
      this.logger.error('Error publishing Kafka event', error);
      throw error;
    }
  }

  async subscribe(
    topic: string,
    groupId: string,
    callback: (message: any) => Promise<void>
  ) {
    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();

    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const parsedMessage = {
          ...message,
          value: message.value ? JSON.parse(message.value.toString()) : null,
        };
        await callback(parsedMessage);
      },
    });

    this.consumers.set(groupId, consumer);
    this.logger.log(`✅ Kafka consumer ${groupId} subscribed to ${topic}`);
  }
}
