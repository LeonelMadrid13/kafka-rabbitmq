import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection;
  private channel;

  // Reconnection properties
  private reconnectTimeout: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000; // 30 seconds
  private isConnecting = false;

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    if (this.isConnecting) return;

    this.isConnecting = true;

    try {
      this.connection = await amqp.connect('amqp://admin:admin@localhost:5672');

      // Connection event handlers
      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', err);
        this.scheduleReconnect();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.scheduleReconnect();
      });

      this.channel = await this.connection.createChannel();

      // Channel event handlers
      this.channel.on('error', (err) => {
        this.logger.error('RabbitMQ channel error', err);
      });

      this.channel.on('close', () => {
        this.logger.warn('RabbitMQ channel closed');
      });

      await this.channel.assertQueue('task-execution', {
        durable: true,
      });

      this.reconnectAttempt = 0;
      this.isConnecting = false;

      this.logger.log('✅ RabbitMQ connected and queue created');
    } catch (error) {
      this.isConnecting = false;
      this.logger.error('Failed to connect to RabbitMQ', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempt),
      this.maxReconnectDelay,
    );

    this.reconnectAttempt++;

    this.logger.log(
      `Reconnecting to RabbitMQ in ${delay}ms (attempt ${this.reconnectAttempt})...`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  async onModuleDestroy() {
    try {
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }

      if (this.channel) {
        await this.channel.close();
      }

      if (this.connection) {
        await this.connection.close();
      }

      this.logger.log('RabbitMQ connection closed');
    } catch (error) {
      this.logger.error('Error closing RabbitMQ connection', error);
    }
  }

  async enqueueTask(task: any) {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not available');
    }

    try {
      const message = JSON.stringify(task);

      this.channel.sendToQueue('task-execution', Buffer.from(message), {
        persistent: true,
      });

      this.logger.debug(`Task enqueued: ${task.taskId}`);
    } catch (error) {
      this.logger.error('Failed to enqueue task', error);
      throw error;
    }
  }

  async consumeTasks(
    callback: (task: any, ack: () => void, nack: () => void) => Promise<void>,
  ) {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not available');
    }

    await this.channel.consume(
      'task-execution',
      async (msg) => {
        if (!msg) return;

        const task = JSON.parse(msg.content.toString());

        const ack = () => this.channel.ack(msg);
        const nack = () => this.channel.nack(msg, false, true);

        await callback(task, ack, nack);
      },
      {
        noAck: false,
      },
    );

    this.logger.log('✅ RabbitMQ consumer started');
  }

  getChannel() {
    return this.channel;
  }

  isConnected(): boolean {
    return !!this.channel;
  }
}
