import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '@app/kafka';
import { TaskEventType } from '@app/events';

@Injectable()
export class TaskApiService {
  private readonly logger = new Logger(TaskApiService.name);

  constructor(private readonly kafkaService: KafkaService) {}

  async createTask(payload: any): Promise<string> {
    const taskId = uuidv4();

    await this.kafkaService.publishEvent(
      'task-lifecycle',
      {
        type: TaskEventType.TASK_ACCEPTED,
        taskId,
        timestamp: new Date(),
        payload,
      },
      taskId,
    );

    this.logger.log(`Task accepted: ${taskId}`);

    return taskId;
  }
}
