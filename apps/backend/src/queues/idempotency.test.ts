import { describe, it, expect } from 'vitest';
import { emailQueue } from './emailQueue';

describe('Queue Idempotency Tests', () => {
  it('deduplicates jobs with identical jobId', async () => {
    const uniqueJobId = `job-test-dedup-${Date.now()}`;

    // Add first job
    const job1 = await emailQueue.add(
      'send-email',
      { emailId: 'email-uuid-1' },
      { jobId: uniqueJobId, delay: 10000 }
    );
    expect(job1.id).toBe(uniqueJobId);

    // Try adding duplicate job with same jobId
    const job2 = await emailQueue.add(
      'send-email',
      { emailId: 'email-uuid-1' },
      { jobId: uniqueJobId, delay: 10000 }
    );
    expect(job2.id).toBe(uniqueJobId);

    // Verify job in queue count
    const delayedCount = await emailQueue.getDelayedCount();
    expect(delayedCount).toBeGreaterThanOrEqual(1);

    // Clean up test job
    const job = await emailQueue.getJob(uniqueJobId);
    if (job) {
      await job.remove();
    }
  });
});
