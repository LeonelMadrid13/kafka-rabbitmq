#!/usr/bin/env ts-node

/**
 * TASK MONITOR SCRIPT
 *
 * This script monitors all tasks flowing through the system by:
 * - Reading Kafka events in real-time
 * - Tracking each task's lifecycle
 * - Showing progress statistics
 * - Detecting stuck tasks
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
  attempt: number;
  payload?: any;
}

class TaskMonitor {
  private kafka: Kafka;
  private tasks: Map<string, TaskProgress> = new Map();
  private stats = {
    accepted: 0,
    dispatched: 0,
    started: 0,
    completed: 0,
    failed: 0,
  };

  constructor() {
    this.kafka = new Kafka({
      clientId: 'task-monitor',
      brokers: ['localhost:9092'],
    });
  }

  async start() {
    console.log('👀 Task Monitor Starting...');
    console.log('━'.repeat(70));
    console.log('Connecting to Kafka...');

    const consumer = this.kafka.consumer({
      groupId: 'monitor-script-' + Date.now(), // Unique group to read all messages
    });

    await consumer.connect();
    await consumer.subscribe({
      topic: 'task-lifecycle',
      fromBeginning: false, // Only new events
    });

    console.log('✅ Connected! Monitoring tasks in real-time...');
    console.log('━'.repeat(70));
    console.log('');

    // Print stats every 5 seconds
    setInterval(() => this.printStats(), 5000);

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const event = JSON.parse(message.value?.toString() || '{}');
          this.processEvent(event);
        } catch (error) {
          console.error('Error processing message:', error);
        }
      },
    });
  }

  private processEvent(event: any) {
    const { taskId, type, timestamp, workerId, attempt } = event;

    let task = this.tasks.get(taskId);
    if (!task) {
      task = {
        taskId,
        attempt: attempt || 1,
      };
      this.tasks.set(taskId, task);
    }

    const time = new Date(timestamp);
    const shortId = taskId.substring(0, 8);

    switch (type) {
      case 'TaskAccepted':
        task.accepted = time;
        task.payload = event.payload;
        this.stats.accepted++;
        console.log(
          `📥 ACCEPTED  | ${shortId} | ${event.payload?.message || 'No message'}`,
        );
        break;

      case 'TaskDispatched':
        task.dispatched = time;
        task.attempt = attempt || task.attempt;
        this.stats.dispatched++;
        const dispatchDelay = task.accepted
          ? time.getTime() - task.accepted.getTime()
          : 0;
        console.log(
          `📤 DISPATCHED | ${shortId} | Delay: ${dispatchDelay}ms | Attempt: ${task.attempt}`,
        );
        break;

      case 'TaskExecutionStarted':
        task.started = time;
        task.workerId = workerId;
        this.stats.started++;
        const queueDelay = task.dispatched
          ? time.getTime() - task.dispatched.getTime()
          : 0;
        console.log(
          `⚙️  STARTED   | ${shortId} | Worker: ${workerId?.substring(0, 15)} | Queue delay: ${queueDelay}ms`,
        );
        break;

      case 'TaskExecutionCompleted':
        task.completed = time;
        this.stats.completed++;
        const execTime = task.started
          ? time.getTime() - task.started.getTime()
          : 0;
        const totalTime = task.accepted
          ? time.getTime() - task.accepted.getTime()
          : 0;
        console.log(
          `✅ COMPLETED  | ${shortId} | Exec: ${execTime}ms | Total: ${totalTime}ms`,
        );

        // Remove from map after completion
        setTimeout(() => this.tasks.delete(taskId), 60000); // Clean up after 1 minute
        break;

      case 'TaskExecutionFailed':
        task.failed = time;
        this.stats.failed++;
        console.log(
          `❌ FAILED     | ${shortId} | Worker: ${workerId?.substring(0, 15)} | Attempt: ${task.attempt}`,
        );
        break;

      case 'TaskRetryScheduled':
        console.log(`🔄 RETRY      | ${shortId} | Attempt: ${attempt}`);
        break;
    }

    // Check for stuck tasks
    this.checkStuckTask(task);
  }

  private checkStuckTask(task: TaskProgress) {
    const now = Date.now();
    const ONE_MINUTE = 60 * 1000;
    const shortId = task.taskId.substring(0, 8);

    // Accepted but not dispatched for > 1 minute
    if (task.accepted && !task.dispatched) {
      const delay = now - task.accepted.getTime();
      if (delay > ONE_MINUTE) {
        console.log(
          `⚠️  STUCK      | ${shortId} | Not dispatched for ${Math.floor(delay / 1000)}s`,
        );
      }
    }

    // Dispatched but not started for > 2 minutes
    if (task.dispatched && !task.started) {
      const delay = now - task.dispatched.getTime();
      if (delay > 2 * ONE_MINUTE) {
        console.log(
          `⚠️  STUCK      | ${shortId} | In queue for ${Math.floor(delay / 1000)}s`,
        );
      }
    }

    // Started but not completed for > 5 minutes
    if (task.started && !task.completed && !task.failed) {
      const delay = now - task.started.getTime();
      if (delay > 5 * ONE_MINUTE) {
        console.log(
          `⚠️  STUCK      | ${shortId} | Executing for ${Math.floor(delay / 1000)}s (Worker: ${task.workerId})`,
        );
      }
    }
  }

  private printStats() {
    const inProgress = Array.from(this.tasks.values()).filter(
      (t) => !t.completed && !t.failed,
    ).length;

    console.log('');
    console.log('━'.repeat(70));
    console.log('📊 STATISTICS');
    console.log('━'.repeat(70));
    console.log(`Accepted:     ${this.stats.accepted}`);
    console.log(`Dispatched:   ${this.stats.dispatched}`);
    console.log(`Started:      ${this.stats.started}`);
    console.log(`Completed:    ${this.stats.completed} ✅`);
    console.log(`Failed:       ${this.stats.failed} ❌`);
    console.log(`In Progress:  ${inProgress} ⏳`);

    if (this.stats.accepted > 0) {
      const completionRate = (
        (this.stats.completed / this.stats.accepted) *
        100
      ).toFixed(1);
      const failureRate = (
        (this.stats.failed / this.stats.accepted) *
        100
      ).toFixed(1);
      console.log(`Success Rate: ${completionRate}%`);
      console.log(`Failure Rate: ${failureRate}%`);
    }

    console.log('━'.repeat(70));
    console.log('');
  }

  async stop() {
    console.log('Stopping monitor...');
    await this.kafka.producer().disconnect();
  }
}

// Handle graceful shutdown
const monitor = new TaskMonitor();

process.on('SIGINT', async () => {
  console.log('\n\nShutting down...');
  await monitor.stop();
  process.exit(0);
});

// Start monitoring
monitor.start().catch((error) => {
  console.error('❌ Monitor failed:', error);
  process.exit(1);
});
