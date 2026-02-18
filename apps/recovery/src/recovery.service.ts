import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '@app/kafka';
import { RabbitmqService } from '@app/rabbitmq';
import { TaskEventType } from '@app/events';

interface TaskState {
  lastEventType: TaskEventType;
  lastEventTimestamp: Date;
  acceptedAt?: Date;
  dispatchedAt?: Date;
  executionStartedAt?: Date;
  completedAt?: Date;
  attempt: number;
  payload?: any;
  workerId?: string;
}

@Injectable()
export class RecoveryService implements OnModuleInit {
  private readonly logger = new Logger(RecoveryService.name);
  private taskStates: Map<string, TaskState> = new Map();

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  async onModuleInit() {
    await this.kafkaService.subscribe(
      'task-lifecycle',
      'recovery-service',
      async (message) => {
        const event = message.value;
        this.updateTaskState(event);
      },
    );

    setInterval(() => this.checkForStuckTasks(), 60000);

    this.logger.log('✅ Recovery service started');
  }

  private updateTaskState(event: any) {
    const { taskId, type, timestamp, workerId, attempt } = event;

    const state: TaskState = this.taskStates.get(taskId) || {
      lastEventType: type,
      lastEventTimestamp: new Date(timestamp),
      attempt: attempt || 1,
    };

    state.lastEventType = type;
    state.lastEventTimestamp = new Date(timestamp);

    switch (type) {
      case TaskEventType.TASK_ACCEPTED:
        state.acceptedAt = new Date(timestamp);
        state.payload = event.payload;
        break;

      case TaskEventType.TASK_DISPATCHED:
        state.dispatchedAt = new Date(timestamp);
        state.attempt = attempt || state.attempt;
        break;

      case TaskEventType.TASK_EXECUTION_STARTED:
        state.executionStartedAt = new Date(timestamp);
        state.workerId = workerId;
        break;

      case TaskEventType.TASK_EXECUTION_COMPLETED:
        state.completedAt = new Date(timestamp);
        break;

      case TaskEventType.TASK_EXECUTION_FAILED:
        state.workerId = workerId;
        break;
    }

    this.taskStates.set(taskId, state);
  }

  private checkForStuckTasks() {
    const now = new Date();
    const ONE_MINUTE = 60 * 1000;

    this.logger.debug(
      `Checking ${this.taskStates.size} tasks for stuck states...`,
    );

    for (const [taskId, state] of this.taskStates) {
      if (state.completedAt) continue;

      if (state.acceptedAt && !state.dispatchedAt) {
        const timeSinceAccepted = now.getTime() - state.acceptedAt.getTime();

        if (timeSinceAccepted > ONE_MINUTE) {
          this.logger.warn(
            `Task ${taskId} stuck after acceptance (${timeSinceAccepted}ms). Re-dispatching...`,
          );
          this.recoverStuckDispatch(taskId, state);
        }
      }

      if (state.dispatchedAt && !state.executionStartedAt) {
        const timeSinceDispatched =
          now.getTime() - state.dispatchedAt.getTime();

        if (timeSinceDispatched > 2 * ONE_MINUTE) {
          this.logger.warn(
            `Task ${taskId} stuck in queue (${timeSinceDispatched}ms)`,
          );
        }
      }

      if (state.executionStartedAt && !state.completedAt) {
        const timeSinceStarted =
          now.getTime() - state.executionStartedAt.getTime();

        if (timeSinceStarted > 5 * ONE_MINUTE) {
          this.logger.error(
            `Task ${taskId} stuck in execution (${timeSinceStarted}ms). Worker ${state.workerId} may have crashed.`,
          );
        }
      }
    }
  }

  private async recoverStuckDispatch(taskId: string, state: TaskState) {
    try {
      const newAttempt = state.attempt + 1;

      await this.rabbitmqService.enqueueTask({
        taskId,
        attempt: newAttempt,
        payload: state.payload,
      });

      await this.kafkaService.publishEvent(
        'task-lifecycle',
        {
          type: TaskEventType.TASK_DISPATCHED,
          taskId,
          timestamp: new Date(),
          attempt: newAttempt,
        },
        taskId,
      );

      this.logger.log(
        `Task ${taskId} recovered and re-dispatched (attempt ${newAttempt})`,
      );
    } catch (error) {
      this.logger.error(`Failed to recover task ${taskId}`, error);
    }
  }
}
