#!/usr/bin/env ts-node

/**
 * TASK MONITOR SCRIPT - LIVE DASHBOARD
 *
 * This script monitors all tasks flowing through the system with a live updating dashboard.
 *
 * Usage:
 *   npx ts-node scripts/monitor.ts
 */

import { Kafka } from 'kafkajs';

interface TaskProgress {
  taskId: string;
  accepted?: Date;
  dispatched?: Date;
  started?: Date;
  completed?: Date;
  failed?: Date;
  workerId?: string;
  currentAttempt: number;
  maxAttempt: number;
  retryCount: number;
  payload?: any;
  isFinalFailure: boolean;
  succeededAfterRetry: boolean;
}

class TaskMonitor {
  private kafka: Kafka;
  private tasks: Map<string, TaskProgress> = new Map();
  private activeWorkers: Set<string> = new Set();
  private workerLastSeen: Map<string, number> = new Map(); // Track last activity
  private readonly WORKER_TIMEOUT = 60000; // 60 seconds without heartbeat = worker considered dead
  private stats = {
    accepted: 0,
    dispatched: 0,
    started: 0,
    completed: 0,
    failed: 0,
    retries: 0,
    finalFailures: 0,
    retriedSuccesses: 0,
  };
  private lastUpdate = Date.now();
  private testBatches: Map<
    string,
    {
      startTime: Date;
      endTime?: Date;
      totalTasks: number;
      completedTasks: number;
    }
  > = new Map();

  constructor() {
    this.kafka = new Kafka({
      clientId: 'task-monitor',
      brokers: ['localhost:9092'],
    });
  }

  async start() {
    console.clear();
    this.printHeader();

    const consumer = this.kafka.consumer({
      groupId: 'monitor-script-' + Date.now(),
    });

    await consumer.connect();

    // Subscribe to both topics
    await consumer.subscribe({ topic: 'task-lifecycle', fromBeginning: false });
    await consumer.subscribe({
      topic: 'worker-heartbeat',
      fromBeginning: false,
    });

    // Update dashboard every 2 seconds (instead of every event for performance)
    setInterval(() => {
      this.cleanupInactiveWorkers();
      this.updateDashboard();
    }, 2000);

    let eventCount = 0;
    let lastDashboardUpdate = Date.now();

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          if (message.value) {
            const event = JSON.parse(message.value.toString());

            if (topic === 'worker-heartbeat') {
              this.processHeartbeat(event);
            } else {
              this.processEvent(event);
            }

            eventCount++;

            // Only update dashboard if 100+ events or 500ms passed (performance optimization)
            const now = Date.now();
            if (eventCount >= 100 || now - lastDashboardUpdate > 500) {
              this.updateDashboard();
              eventCount = 0;
              lastDashboardUpdate = now;
            }
          }
        } catch (error) {
          // Silently ignore parsing errors
        }
      },
    });
  }

  private printHeader() {
    console.log(
      '╔════════════════════════════════════════════════════════════════════╗',
    );
    console.log(
      '║              📊 TASK PROCESSING MONITOR - LIVE                     ║',
    );
    console.log(
      '╚════════════════════════════════════════════════════════════════════╝',
    );
    console.log('');
  }

  private processHeartbeat(event: any) {
    const { workerId, status } = event;

    if (status === 'stopped') {
      // Worker explicitly stopped
      this.activeWorkers.delete(workerId);
      this.workerLastSeen.delete(workerId);
    } else {
      // Worker is active
      this.activeWorkers.add(workerId);
      this.workerLastSeen.set(workerId, Date.now());
    }
  }

  private processEvent(event: any) {
    const { taskId, type, workerId, attempt } = event;

    let task = this.tasks.get(taskId);
    if (!task) {
      task = {
        taskId,
        currentAttempt: attempt || 1,
        maxAttempt: attempt || 1,
        retryCount: 0,
        isFinalFailure: false,
        succeededAfterRetry: false,
      };
      this.tasks.set(taskId, task);
    }

    this.lastUpdate = Date.now();

    switch (type) {
      case 'TaskAccepted':
        task.accepted = new Date(event.timestamp);
        task.payload = event.payload;
        this.stats.accepted++;

        // Track test batch if metadata exists
        if (event.metadata?.testBatchId) {
          const batchId = event.metadata.testBatchId;
          if (!this.testBatches.has(batchId)) {
            this.testBatches.set(batchId, {
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
        task.maxAttempt = Math.max(task.maxAttempt, attempt || 1);

        if (attempt > 1) {
          task.retryCount++;
          this.stats.retries++;
        } else {
          this.stats.dispatched++;
        }

        task.failed = undefined;
        task.started = undefined;
        break;

      case 'TaskExecutionStarted':
        task.started = new Date(event.timestamp);
        task.workerId = workerId;
        this.stats.started++;

        // Track active worker with timestamp
        if (workerId) {
          this.activeWorkers.add(workerId);
          this.workerLastSeen.set(workerId, Date.now());
        }
        break;

      case 'TaskExecutionCompleted':
        task.completed = new Date(event.timestamp);
        this.stats.completed++;

        // Update worker last seen
        if (task.workerId) {
          this.workerLastSeen.set(task.workerId, Date.now());
        }

        // Track if this was a retry success
        if (task.retryCount > 0) {
          task.succeededAfterRetry = true;
          this.stats.retriedSuccesses++;
        }

        // Update test batch completion
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

        setTimeout(() => this.tasks.delete(taskId), 60000);
        break;

      case 'TaskExecutionFailed':
        task.failed = new Date(event.timestamp);
        this.stats.failed++;

        // Update worker last seen even on failure
        if (task.workerId) {
          this.workerLastSeen.set(task.workerId, Date.now());
        }

        if (task.currentAttempt >= 3) {
          task.isFinalFailure = true;
          this.stats.finalFailures++;

          // Count as completed for test batch (even if failed)
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
    const inactiveWorkers: string[] = [];

    for (const [workerId, lastSeen] of this.workerLastSeen) {
      if (now - lastSeen > this.WORKER_TIMEOUT) {
        inactiveWorkers.push(workerId);
      }
    }

    // Remove inactive workers
    for (const workerId of inactiveWorkers) {
      this.activeWorkers.delete(workerId);
      this.workerLastSeen.delete(workerId);
    }
  }

  private updateDashboard() {
    // Move cursor to top and clear screen below
    process.stdout.write('\x1B[3;0H\x1B[J');

    const inProgress = Array.from(this.tasks.values()).filter(
      (t) => !t.completed && !t.isFinalFailure,
    ).length;

    const lines: string[] = [];

    lines.push(
      '┌────────────────────────────────────────────────────────────────────┐',
    );
    lines.push(
      '│                          TASK STATISTICS                           │',
    );
    lines.push(
      '├────────────────────────────────────────────────────────────────────┤',
    );

    // Worker info
    lines.push(
      `│  👷 Active Workers:     ${this.padRight(this.activeWorkers.size.toString(), 42)} │`,
    );
    lines.push(
      '├────────────────────────────────────────────────────────────────────┤',
    );

    // Core metrics
    lines.push(
      `│  📥 Accepted:           ${this.padRight(this.stats.accepted.toString(), 42)} │`,
    );
    lines.push(
      `│  📤 Dispatched:         ${this.padRight(this.stats.dispatched.toString(), 42)} │`,
    );
    lines.push(
      `│  ⚙️  Started:            ${this.padRight(this.stats.started.toString(), 42)} │`,
    );
    lines.push(
      `│  ✅ Completed:          ${this.padRight(this.stats.completed.toString(), 42)} │`,
    );
    lines.push(
      `│  ❌ Failed (total):     ${this.padRight(this.stats.failed.toString(), 42)} │`,
    );
    lines.push(
      '├────────────────────────────────────────────────────────────────────┤',
    );

    // Retry metrics
    lines.push(
      `│  🔄 Total Retries:      ${this.padRight(this.stats.retries.toString(), 42)} │`,
    );
    lines.push(
      `│  🎯 Retry Successes:    ${this.padRight(this.stats.retriedSuccesses.toString(), 42)} │`,
    );
    lines.push(
      `│  💀 Final Failures:     ${this.padRight(this.stats.finalFailures.toString(), 42)} │`,
    );
    lines.push(
      `│  ⏳ In Progress:        ${this.padRight(inProgress.toString(), 42)} │`,
    );
    lines.push(
      '├────────────────────────────────────────────────────────────────────┤',
    );

    // Rates
    if (this.stats.accepted > 0) {
      const totalResolved = this.stats.completed + this.stats.finalFailures;
      const successRate =
        totalResolved > 0
          ? ((this.stats.completed / totalResolved) * 100).toFixed(1)
          : '0.0';
      const failureRate =
        totalResolved > 0
          ? ((this.stats.finalFailures / totalResolved) * 100).toFixed(1)
          : '0.0';

      lines.push(
        `│  📊 Success Rate:       ${this.padRight(successRate + '%', 42)} │`,
      );
      lines.push(
        `│  📊 Failure Rate:       ${this.padRight(failureRate + '%', 42)} │`,
      );

      // Retry success rate
      if (this.stats.retries > 0) {
        const retrySuccessRate = (
          (this.stats.retriedSuccesses / this.stats.retries) *
          100
        ).toFixed(1);
        lines.push(
          `│  🔄 Retry Success Rate: ${this.padRight(retrySuccessRate + '%', 42)} │`,
        );
      }

      // Average retries per task
      if (this.stats.completed > 0) {
        const avgRetries = (this.stats.retries / this.stats.completed).toFixed(
          2,
        );
        lines.push(
          `│  📈 Avg Retries/Task:   ${this.padRight(avgRetries, 42)} │`,
        );
      }
    }

    lines.push(
      '└────────────────────────────────────────────────────────────────────┘',
    );

    // Test batch timing
    if (this.testBatches.size > 0) {
      lines.push('');
      lines.push(
        '┌────────────────────────────────────────────────────────────────────┐',
      );
      lines.push(
        '│                         TEST BATCH TIMING                          │',
      );
      lines.push(
        '├────────────────────────────────────────────────────────────────────┤',
      );

      for (const [batchId, batch] of this.testBatches) {
        const progress = `${batch.completedTasks}/${batch.totalTasks}`;
        const shortId = batchId.substring(0, 8);

        if (batch.endTime) {
          const duration = batch.endTime.getTime() - batch.startTime.getTime();
          const seconds = (duration / 1000).toFixed(2);
          const throughput = (batch.totalTasks / (duration / 1000)).toFixed(2);
          lines.push(
            `│  🎯 Batch ${shortId}: ✅ Complete in ${seconds}s (${throughput} tasks/s)${' '.repeat(Math.max(0, 7 - seconds.length))} │`,
          );
        } else {
          const elapsed = Date.now() - batch.startTime.getTime();
          const seconds = (elapsed / 1000).toFixed(0);
          lines.push(
            `│  ⏳ Batch ${shortId}: ${this.padRight(progress, 10)} (${seconds}s elapsed)${' '.repeat(Math.max(0, 20 - progress.length - seconds.length))} │`,
          );
        }
      }

      lines.push(
        '└────────────────────────────────────────────────────────────────────┘',
      );
    }

    // Last update time
    const secondsAgo = Math.floor((Date.now() - this.lastUpdate) / 1000);
    const updateText = secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`;
    lines.push('');
    lines.push(`  Last update: ${updateText}`);

    // Show worker list with activity status
    if (this.activeWorkers.size > 0) {
      const workerDetails = Array.from(this.activeWorkers).map((workerId) => {
        const lastSeen = this.workerLastSeen.get(workerId) || 0;
        const secondsAgo = Math.floor((Date.now() - lastSeen) / 1000);
        const shortId = workerId.substring(0, 15);

        if (secondsAgo < 10) {
          return `${shortId} (active)`;
        } else {
          return `${shortId} (${secondsAgo}s ago)`;
        }
      });

      lines.push(`  Workers: ${workerDetails.join(', ')}`);
    } else {
      lines.push('  Workers: None active');
    }

    lines.push('  Press Ctrl+C to exit');

    console.log(lines.join('\n'));
  }

  private padRight(text: string, width: number): string {
    return text + ' '.repeat(Math.max(0, width - text.length));
  }

  async stop() {
    await this.kafka.producer().disconnect();
  }
}

// Handle graceful shutdown
const monitor = new TaskMonitor();

process.on('SIGINT', async () => {
  console.clear();
  console.log('\n\n👋 Monitor stopped\n');
  await monitor.stop();
  process.exit(0);
});

// Start monitoring
monitor.start().catch((error) => {
  console.error('❌ Monitor failed:', error);
  process.exit(1);
});
