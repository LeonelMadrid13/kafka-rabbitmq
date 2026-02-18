#!/usr/bin/env ts-node

/**
 * LOAD TEST SCRIPT
 * 
 * This script sends multiple concurrent requests to test:
 * - API throughput
 * - Kafka write performance
 * - RabbitMQ queue depth
 * - Worker processing capacity
 * 
 * Usage:
 *   npx ts-node scripts/load-test.ts
 *   npx ts-node scripts/load-test.ts --tasks=100 --concurrency=10
 */

interface LoadTestOptions {
  tasks: number;        // Total number of tasks to create
  concurrency: number;  // How many at once
  apiUrl: string;       // API endpoint
  delayMs: number;      // Delay between batches
}

const DEFAULT_OPTIONS: LoadTestOptions = {
  tasks: 50,
  concurrency: 10,
  apiUrl: 'http://localhost:3000/tasks',
  delayMs: 100,
};

async function createTask(taskNumber: number, apiUrl: string): Promise<any> {
  const payload = {
    message: `Load test task #${taskNumber}`,
    priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
    data: {
      taskNumber,
      timestamp: new Date().toISOString(),
      randomData: Math.random().toString(36).substring(7),
    },
  };

  const startTime = Date.now();
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const duration = Date.now() - startTime;

    return {
      success: true,
      taskNumber,
      taskId: result.taskId,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      taskNumber,
      error: error.message,
      duration,
    };
  }
}

async function runLoadTest(options: LoadTestOptions) {
  console.log('🚀 Starting Load Test');
  console.log('━'.repeat(50));
  console.log(`Total tasks: ${options.tasks}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`API: ${options.apiUrl}`);
  console.log('━'.repeat(50));
  console.log('');

  const results = {
    total: 0,
    successful: 0,
    failed: 0,
    durations: [] as number[],
    startTime: Date.now(),
  };

  // Process in batches
  for (let i = 0; i < options.tasks; i += options.concurrency) {
    const batchSize = Math.min(options.concurrency, options.tasks - i);
    const batchNumber = Math.floor(i / options.concurrency) + 1;
    const totalBatches = Math.ceil(options.tasks / options.concurrency);

    console.log(`📦 Batch ${batchNumber}/${totalBatches}: Creating ${batchSize} tasks...`);

    // Create batch of tasks concurrently
    const promises = Array.from({ length: batchSize }, (_, j) =>
      createTask(i + j + 1, options.apiUrl)
    );

    const batchResults = await Promise.all(promises);

    // Update results
    for (const result of batchResults) {
      results.total++;
      if (result.success) {
        results.successful++;
        results.durations.push(result.duration);
        console.log(`  ✅ Task #${result.taskNumber}: ${result.taskId} (${result.duration}ms)`);
      } else {
        results.failed++;
        console.log(`  ❌ Task #${result.taskNumber}: ${result.error} (${result.duration}ms)`);
      }
    }

    // Progress
    const progress = ((i + batchSize) / options.tasks * 100).toFixed(1);
    console.log(`  Progress: ${progress}%`);
    console.log('');

    // Delay between batches (don't overwhelm the system)
    if (i + options.concurrency < options.tasks) {
      await new Promise(resolve => setTimeout(resolve, options.delayMs));
    }
  }

  // Calculate statistics
  const totalTime = Date.now() - results.startTime;
  const avgDuration = results.durations.reduce((a, b) => a + b, 0) / results.durations.length;
  const minDuration = Math.min(...results.durations);
  const maxDuration = Math.max(...results.durations);
  const throughput = (results.successful / (totalTime / 1000)).toFixed(2);

  // Print summary
  console.log('');
  console.log('📊 LOAD TEST SUMMARY');
  console.log('━'.repeat(50));
  console.log(`Total tasks:      ${results.total}`);
  console.log(`Successful:       ${results.successful} ✅`);
  console.log(`Failed:           ${results.failed} ❌`);
  console.log(`Success rate:     ${(results.successful / results.total * 100).toFixed(1)}%`);
  console.log('');
  console.log('⏱️  TIMING');
  console.log('━'.repeat(50));
  console.log(`Total time:       ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Avg response:     ${avgDuration.toFixed(2)}ms`);
  console.log(`Min response:     ${minDuration}ms`);
  console.log(`Max response:     ${maxDuration}ms`);
  console.log(`Throughput:       ${throughput} tasks/sec`);
  console.log('');
  console.log('💡 Next Steps:');
  console.log('  1. Check Kafka UI: http://localhost:8080');
  console.log('  2. Check RabbitMQ UI: http://localhost:15672');
  console.log('  3. Watch your NestJS logs for processing');
  console.log('');
}

// Parse command line arguments
function parseArgs(): LoadTestOptions {
  const args = process.argv.slice(2);
  const options = { ...DEFAULT_OPTIONS };

  for (const arg of args) {
    if (arg.startsWith('--tasks=')) {
      options.tasks = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--url=')) {
      options.apiUrl = arg.split('=')[1];
    } else if (arg.startsWith('--delay=')) {
      options.delayMs = parseInt(arg.split('=')[1]);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npx ts-node scripts/load-test.ts [options]

Options:
  --tasks=N         Number of tasks to create (default: 50)
  --concurrency=N   How many tasks to create at once (default: 10)
  --url=URL         API endpoint (default: http://localhost:3000/tasks)
  --delay=N         Delay between batches in ms (default: 100)
  --help, -h        Show this help message

Examples:
  npx ts-node scripts/load-test.ts
  npx ts-node scripts/load-test.ts --tasks=100 --concurrency=20
  npx ts-node scripts/load-test.ts --tasks=1000 --concurrency=50 --delay=0
      `);
      process.exit(0);
    }
  }

  return options;
}

// Run the test
const options = parseArgs();
runLoadTest(options).catch(error => {
  console.error('❌ Load test failed:', error);
  process.exit(1);
});
