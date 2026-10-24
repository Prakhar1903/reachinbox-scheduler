import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';

export interface EmailJobData {
  emailId: string;
}

export const EMAIL_QUEUE_NAME = 'email-send';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // 24 hours
      count: 2000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // 7 days
      count: 2000,
    },
  },
});

/**
 * Schedules an email job with BullMQ using strict idempotency.
 * Job ID is locked to the unique email ID.
 */
export async function scheduleEmailJob(
  emailId: string,
  scheduledAt: Date,
  customJobId?: string
) {
  const now = Date.now();
  const scheduledTime = scheduledAt.getTime();
  const delay = Math.max(0, scheduledTime - now);
  const jobId = customJobId || emailId;

  const job = await emailQueue.add(
    'send-email',
    { emailId },
    {
      jobId,
      delay,
    }
  );

  return job;
}
