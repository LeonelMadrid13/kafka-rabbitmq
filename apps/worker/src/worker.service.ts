import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { KafkaService } from '@app/kafka';
import { RabbitmqService } from '@app/rabbitmq';
import { TaskEventType } from '@app/events';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly workerId = `worker-${process.pid}`;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  async onModuleInit() {
    // Send initial heartbeat
    await this.sendHeartbeat('started');

    // Send heartbeat every 10 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat('active');
    }, 10000);

    await this.rabbitmqService.consumeTasks(async (task, ack, nack) => {
      const { taskId, payload } = task;

      try {
        await this.kafkaService.publishEvent(
          'task-lifecycle',
          {
            type: TaskEventType.TASK_EXECUTION_STARTED,
            taskId,
            timestamp: new Date(),
            workerId: this.workerId,
          },
          taskId,
        );

        const result = await this.executeTask(payload);

        await this.kafkaService.publishEvent(
          'task-lifecycle',
          {
            type: TaskEventType.TASK_EXECUTION_COMPLETED,
            taskId,
            timestamp: new Date(),
            workerId: this.workerId,
            result,
          },
          taskId,
        );

        ack();
        this.logger.log(`Task completed: ${taskId}`);
      } catch (error) {
        this.logger.error(`Task failed: ${taskId}`, error);

        await this.kafkaService.publishEvent(
          'task-lifecycle',
          {
            type: TaskEventType.TASK_EXECUTION_FAILED,
            taskId,
            timestamp: new Date(),
            workerId: this.workerId,
            error: error.message,
          },
          taskId,
        );

        nack();
      }
    });

    this.logger.log(`✅ Worker ${this.workerId} started`);
  }

  async onModuleDestroy() {
    // Send shutdown heartbeat
    await this.sendHeartbeat('stopped');

    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.logger.log(`Worker ${this.workerId} shutting down`);
  }

  private async sendHeartbeat(status: 'started' | 'active' | 'stopped') {
    try {
      await this.kafkaService.publishEvent(
        'worker-heartbeat',
        {
          type: 'WorkerHeartbeat',
          workerId: this.workerId,
          timestamp: new Date(),
          status,
        },
        this.workerId,
      );
    } catch (error) {
      // Don't log heartbeat errors to avoid spam
    }
  }

  private async executeTask(payload: any): Promise<any> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      status: 'processed',
      message: payload.message,
      processedAt: new Date(),
    };
  }
}
