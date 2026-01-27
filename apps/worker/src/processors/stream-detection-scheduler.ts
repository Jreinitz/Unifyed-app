import { Queue } from 'bullmq';

interface SchedulerConfig {
  connection: {
    host: string;
    port: number;
  };
  pollIntervalMs?: number;
}

/**
 * Stream Detection Scheduler
 * Runs periodic jobs to detect when creators go live
 */
export class StreamDetectionScheduler {
  private queue: Queue;
  private intervalId: NodeJS.Timeout | undefined = undefined;
  private pollIntervalMs: number;

  constructor(config: SchedulerConfig) {
    this.queue = new Queue('stream-detection', {
      connection: config.connection,
    });
    this.pollIntervalMs = config.pollIntervalMs || 30000; // Default: 30 seconds
  }

  /**
   * Start the scheduler
   * Queues stream detection jobs at regular intervals
   */
  async start(): Promise<void> {
    console.log(`📅 Starting stream detection scheduler (interval: ${this.pollIntervalMs}ms)`);

    // Run immediately on start
    await this.queueDetectionJob();

    // Then run at intervals
    this.intervalId = setInterval(async () => {
      try {
        await this.queueDetectionJob();
      } catch (error) {
        console.error('❌ Failed to queue stream detection job:', error);
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    await this.queue.close();
    console.log('📅 Stream detection scheduler stopped');
  }

  /**
   * Queue a job to check all creators
   */
  private async queueDetectionJob(): Promise<void> {
    await this.queue.add(
      'check-all',
      {
        type: 'check_all_creators',
      },
      {
        removeOnComplete: true,
        removeOnFail: 50,
        // Prevent duplicate jobs from stacking up
        jobId: `check-all-${Date.now()}`,
      }
    );
    console.log('📤 Queued stream detection job');
  }

  /**
   * Queue a job to check a specific creator
   */
  async checkCreator(creatorId: string): Promise<void> {
    await this.queue.add(
      'check-creator',
      {
        type: 'check_creator',
        creatorId,
      },
      {
        removeOnComplete: true,
        removeOnFail: 10,
        // Deduplicate checks for the same creator
        jobId: `check-creator-${creatorId}-${Math.floor(Date.now() / 10000)}`,
      }
    );
  }

  /**
   * Queue a job to check a specific Restream connection
   */
  async checkRestream(toolConnectionId: string): Promise<void> {
    await this.queue.add(
      'check-restream',
      {
        type: 'check_restream',
        toolConnectionId,
      },
      {
        removeOnComplete: true,
        removeOnFail: 10,
      }
    );
  }

  /**
   * Queue a job to check a specific platform connection
   */
  async checkPlatform(
    connectionId: string,
    platform: 'youtube' | 'twitch' | 'tiktok'
  ): Promise<void> {
    await this.queue.add(
      'check-platform',
      {
        type: 'check_platform',
        connectionId,
        platform,
      },
      {
        removeOnComplete: true,
        removeOnFail: 10,
      }
    );
  }
}

/**
 * Create and start the stream detection scheduler
 */
export function createStreamDetectionScheduler(config: SchedulerConfig): StreamDetectionScheduler {
  return new StreamDetectionScheduler(config);
}
