import { Controller, Post, Body, Get } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface LoadTestConfig {
  tasks: number;
  concurrency: number;
  delay?: number;
}

@Controller('api')
export class DashboardController {
  private runningTests: Map<string, any> = new Map();

  @Get('status')
  getStatus() {
    return {
      status: 'ok',
      runningTests: Array.from(this.runningTests.values()),
    };
  }

  @Post('load-test')
  async startLoadTest(@Body() config: LoadTestConfig) {
    const { tasks = 100, concurrency = 10, delay = 100 } = config;

    const testId = `test-${Date.now()}`;

    // Store test info
    this.runningTests.set(testId, {
      id: testId,
      config,
      status: 'running',
      startTime: new Date(),
    });

    // Run load test in background
    this.executeLoadTest(testId, tasks, concurrency, delay);

    return {
      success: true,
      testId,
      message: `Load test started with ${tasks} tasks`,
    };
  }

  private async executeLoadTest(
    testId: string,
    tasks: number,
    concurrency: number,
    delay: number,
  ) {
    try {
      const command = `npx ts-node scripts/load-test.ts --tasks=${tasks} --concurrency=${concurrency} --delay=${delay}`;

      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
      });

      // Update test status
      const test = this.runningTests.get(testId);
      if (test) {
        test.status = 'completed';
        test.endTime = new Date();
        test.output = stdout;
      }

      // Clean up after 5 minutes
      setTimeout(() => this.runningTests.delete(testId), 300000);
    } catch (error) {
      const test = this.runningTests.get(testId);
      if (test) {
        test.status = 'failed';
        test.endTime = new Date();
        test.error = error.message;
      }
    }
  }

  @Get('workers')
  getWorkers() {
    // This would be enhanced with actual worker data from Kafka
    return {
      workers: [],
    };
  }
}
