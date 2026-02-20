import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '@app/kafka';

interface DashboardStats {
  workers: {
    active: number;
    list: Array<{ id: string; lastSeen: number }>;
  };
  tasks: {
    accepted: number;
    dispatched: number;
    started: number;
    completed: number;
    failed: number;
    retries: number;
    finalFailures: number;
    retriedSuccesses: number;
    inProgress: number;
  };
  rates: {
    successRate: string;
    failureRate: string;
    retrySuccessRate: string;
    avgRetries: string;
  };
  testBatches: Array<{
    id: string;
    startTime: Date;
    endTime?: Date;
    totalTasks: number;
    completedTasks: number;
    duration?: number;
    throughput?: number;
  }>;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class DashboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private stats: DashboardStats = {
    workers: { active: 0, list: [] },
    tasks: {
      accepted: 0,
      dispatched: 0,
      started: 0,
      completed: 0,
      failed: 0,
      retries: 0,
      finalFailures: 0,
      retriedSuccesses: 0,
      inProgress: 0,
    },
    rates: {
      successRate: '0',
      failureRate: '0',
      retrySuccessRate: '0',
      avgRetries: '0',
    },
    testBatches: [],
  };

  private activeWorkers: Map<string, number> = new Map();
  private tasks: Map<string, any> = new Map();
  private testBatches: Map<string, any> = new Map();
  private readonly WORKER_TIMEOUT = 60000;

  constructor(private readonly kafkaService: KafkaService) {}

  async onModuleInit() {
    // Subscribe to Kafka topics
    await this.kafkaService.subscribe(
      'task-lifecycle',
      'dashboard-task-events',
      async (message) => {
        this.processTaskEvent(message.value);
      },
    );

    await this.kafkaService.subscribe(
      'worker-heartbeat',
      'dashboard-worker-heartbeat',
      async (message) => {
        this.processHeartbeat(message.value);
      },
    );

    // Broadcast stats every 2 seconds
    setInterval(() => {
      this.cleanupInactiveWorkers();
      this.calculateStats();
      this.broadcastStats();
    }, 2000);

    this.logger.log('Dashboard Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    // Send current stats immediately
    client.emit('stats', this.stats);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private processHeartbeat(event: any) {
    const { workerId, status } = event;

    if (status === 'stopped') {
      this.activeWorkers.delete(workerId);
    } else {
      this.activeWorkers.set(workerId, Date.now());
    }
  }

  private processTaskEvent(event: any) {
    const { taskId, type, workerId, attempt } = event;

    let task = this.tasks.get(taskId);
    if (!task) {
      task = {
        taskId,
        currentAttempt: attempt || 1,
        retryCount: 0,
        isFinalFailure: false,
        succeededAfterRetry: false,
      };
      this.tasks.set(taskId, task);
    }

    switch (type) {
      case 'TaskAccepted':
        task.accepted = new Date(event.timestamp);
        task.payload = event.payload;

        // Track test batch
        if (event.metadata?.testBatchId) {
          const batchId = event.metadata.testBatchId;
          if (!this.testBatches.has(batchId)) {
            this.testBatches.set(batchId, {
              id: batchId,
              startTime: new Date(event.timestamp),
              totalTasks: event.metadata.totalTasks || 0,
              completedTasks: 0,
            });
          }
        }
        break;

      case 'TaskDispatched':
        task.dispatched = new Date(event.timestamp);
        task.currentAttempt = attempt || task.currentAttempt;

        if (attempt > 1) {
          task.retryCount++;
        }
        break;

      case 'TaskExecutionStarted':
        task.started = new Date(event.timestamp);
        task.workerId = workerId;

        if (workerId) {
          this.activeWorkers.set(workerId, Date.now());
        }
        break;

      case 'TaskExecutionCompleted':
        task.completed = new Date(event.timestamp);

        if (task.retryCount > 0) {
          task.succeededAfterRetry = true;
        }

        // Update test batch
        if (task.payload?.metadata?.testBatchId) {
          const batchId = task.payload.metadata.testBatchId;
          const batch = this.testBatches.get(batchId);
          if (batch) {
            batch.completedTasks++;
            if (batch.completedTasks >= batch.totalTasks) {
              batch.endTime = new Date(event.timestamp);
            }
          }
        }

        // Cleanup after 1 minute
        setTimeout(() => this.tasks.delete(taskId), 60000);
        break;

      case 'TaskExecutionFailed':
        task.failed = new Date(event.timestamp);

        if (task.currentAttempt >= 3) {
          task.isFinalFailure = true;

          // Update test batch even on failure
          if (task.payload?.metadata?.testBatchId) {
            const batchId = task.payload.metadata.testBatchId;
            const batch = this.testBatches.get(batchId);
            if (batch) {
              batch.completedTasks++;
              if (batch.completedTasks >= batch.totalTasks) {
                batch.endTime = new Date(event.timestamp);
              }
            }
          }
        }
        break;
    }
  }

  private cleanupInactiveWorkers() {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [workerId, lastSeen] of this.activeWorkers) {
      if (now - lastSeen > this.WORKER_TIMEOUT) {
        toRemove.push(workerId);
      }
    }

    toRemove.forEach((id) => this.activeWorkers.delete(id));
  }

  private calculateStats() {
    const tasks = Array.from(this.tasks.values());

    // Count stats
    const accepted = tasks.filter((t) => t.accepted).length;
    const dispatched = tasks.filter(
      (t) => t.dispatched && t.currentAttempt === 1,
    ).length;
    const started = tasks.filter((t) => t.started).length;
    const completed = tasks.filter((t) => t.completed).length;
    const failed = tasks.filter((t) => t.failed).length;
    const retries = tasks.reduce((sum, t) => sum + t.retryCount, 0);
    const finalFailures = tasks.filter((t) => t.isFinalFailure).length;
    const retriedSuccesses = tasks.filter((t) => t.succeededAfterRetry).length;
    const inProgress = tasks.filter(
      (t) => !t.completed && !t.isFinalFailure,
    ).length;

    // Calculate rates
    const totalResolved = completed + finalFailures;
    const successRate =
      totalResolved > 0 ? ((completed / totalResolved) * 100).toFixed(1) : '0';
    const failureRate =
      totalResolved > 0
        ? ((finalFailures / totalResolved) * 100).toFixed(1)
        : '0';
    const retrySuccessRate =
      retries > 0 ? ((retriedSuccesses / retries) * 100).toFixed(1) : '0';
    const avgRetries = completed > 0 ? (retries / completed).toFixed(2) : '0';

    // Worker list
    const workerList = Array.from(this.activeWorkers.entries()).map(
      ([id, lastSeen]) => ({
        id,
        lastSeen,
      }),
    );

    // Test batches
    const batches = Array.from(this.testBatches.values()).map((batch) => {
      const result: any = { ...batch };
      if (batch.endTime) {
        result.duration = batch.endTime.getTime() - batch.startTime.getTime();
        result.throughput = (
          batch.totalTasks /
          (result.duration / 1000)
        ).toFixed(2);
      }
      return result;
    });

    this.stats = {
      workers: {
        active: this.activeWorkers.size,
        list: workerList,
      },
      tasks: {
        accepted,
        dispatched,
        started,
        completed,
        failed,
        retries,
        finalFailures,
        retriedSuccesses,
        inProgress,
      },
      rates: {
        successRate,
        failureRate,
        retrySuccessRate,
        avgRetries,
      },
      testBatches: batches,
    };
  }

  private broadcastStats() {
    this.server.emit('stats', this.stats);
  }
}
