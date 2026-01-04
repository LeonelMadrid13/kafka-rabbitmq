import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { TaskEventType } from '../kafka/events/task-events';
import { retry } from 'rxjs';

@Injectable()
export class DispatchService implements OnModuleInit {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  async onModuleInit() {
    // What should we do when the app starts?
    await this.kafkaService.subscribe(
      'task-lifecycle',
      'dispatch-service', // Consumer group name
      async (message) => {
        const event = message.value;
        if (event.type === TaskEventType.TASK_ACCEPTED) {
          const { taskId, payload } = event;
          try {
            await this.rabbitmqService.enqueueTask({
              taskId,
              attempt: 1,
              payload,
            });

            await this.kafkaService.publishEvent(
              'task-lifecycle',
              {
                type: TaskEventType.TASK_DISPATCHED,
                taskId,
                timestamp: new Date(),
                attempt: 1,
              },
              taskId,
            );

            this.logger.log(`Task dispatched: ${taskId}`);
          } catch (error) {
            this.logger.error(`Failed to dispatch task ${taskId}`, error);
          }
        }
      },
    );
    this.logger.log('✅ Dispatch service listening to Kafka');
  }
}
