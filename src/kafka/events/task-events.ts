export enum TaskEventType {
  TASK_ACCEPTED = 'TaskAccepted',
  TASK_REJECTED = 'TaskRejected',
  TASK_DISPATCHED = 'TaskDispatched',
  TASK_EXECUTION_STARTED = 'TaskExecutionStarted',
  TASK_EXECUTION_COMPLETED = 'TaskExecutionCompleted',
  TASK_EXECUTION_FAILED = 'TaskExecutionFailed',
  TASK_RETRY_SCHEDULED = 'TaskRetryScheduled',
}

export interface TaskEvent {
  type: TaskEventType;
  taskId: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export interface TaskAcceptedEvent extends TaskEvent {
  type: TaskEventType.TASK_ACCEPTED;
  payload: any; // The actual task data
}

export interface TaskDispatchedEvent extends TaskEvent {
  type: TaskEventType.TASK_DISPATCHED;
  attempt: number;
}

export interface TaskExecutionCompletedEvent extends TaskEvent {
  type: TaskEventType.TASK_EXECUTION_COMPLETED;
  workerId: string;
  result: any;
}

export interface TaskExecutionFailedEvent extends TaskEvent {
  type: TaskEventType.TASK_EXECUTION_FAILED;
  workerId: string;
  error: string;
}
