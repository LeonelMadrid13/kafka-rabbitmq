import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '../kafka/kafka.service';
import { TaskEventType } from '../kafka/events/task-events';

@Injectable()
export class TaskApiService {
  private readonly logger = new Logger(TaskApiService.name);

  constructor(private readonly kafkaService: KafkaService) {}

  async createTask(payload: any): Promise<string> {
    const taskId = uuidv4();

    // Publish TaskAccepted event to Kafka
    await this.kafkaService.publishEvent(
      'task-lifecycle',
      {
        type: TaskEventType.TASK_ACCEPTED,
        taskId,
        timestamp: new Date(),
        payload,
      },
      taskId, // Use taskId as key for ordering
    );

    this.logger.log(`Task accepted: ${taskId}`);

    return taskId;
  }
}
