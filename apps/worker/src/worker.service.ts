import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '@app/kafka';
import { RabbitmqService } from '@app/rabbitmq';
import { TaskEventType } from '@app/events';

@Injectable()
export class WorkerService implements OnModuleInit {
  private readonly logger = new Logger(WorkerService.name);
  private readonly workerId = `worker-${process.pid}`;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  async onModuleInit() {
    await this.rabbitmqService.consumeTasks(async (task, ack, nack) => {
      const { taskId, payload } = task;

      try {
        // Record start
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

        // DO THE ACTUAL WORK
        const result = await this.executeTask(payload);

        // Record success
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

        // ACK to RabbitMQ (delete the task)
        ack();

        this.logger.log(`Task completed: ${taskId}`);
      } catch (error) {
        this.logger.error(`Task failed: ${taskId}`, error);

        // Record failure
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

        // NACK to RabbitMQ (requeue for retry)
        nack();
      }
    });

    this.logger.log(`✅ Worker ${this.workerId} started`);
  }

  private async executeTask(payload: any): Promise<any> {
    // YOUR BUSINESS LOGIC HERE
    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      status: 'processed',
      message: payload.message,
      processedAt: new Date(),
    };
  }
}
