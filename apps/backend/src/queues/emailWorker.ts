import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { EMAIL_QUEUE_NAME, EmailJobData, emailQueue } from './emailQueue';
import { acquireSenderSlot } from './senderLock';
import { checkAndIncrementHourlyRate, getMsUntilNextHour } from './rateLimiter';
import { sendEmailViaEthereal } from '../services/emailService';
import { updateEmailStatusInIndex, indexEmail } from '../services/searchService';
import { notifyRateLimitHit } from '../services/slackService';

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const { emailId } = job.data;

      // 1. Fetch email and sender details
      const email = await prisma.email.findUnique({
        where: { id: emailId },
        include: { sender: true },
      });

      if (!email) {
        console.warn(`[EmailWorker] Email with ID ${emailId} not found. Skipping.`);
        return;
      }

      // Runnable state guard: Only process emails that are currently SCHEDULED or RATE_LIMITED
      if (email.status !== 'SCHEDULED' && email.status !== 'RATE_LIMITED') {
        console.log(`[EmailWorker] Email ${emailId} is not in runnable state (${email.status}). Skipping.`);
        return;
      }

      const sender = email.sender;
      const minDelayMs = email.delaySeconds * 1000 || env.DELAY_BETWEEN_EMAILS_MS;
      const hourlyLimit = email.hourlyLimit || env.MAX_EMAILS_PER_HOUR_PER_SENDER;

      // 2. Concurrency Safety: Check Per-Sender minimum interval lock
      const slotAcquired = await acquireSenderSlot(sender.id, minDelayMs);
      if (!slotAcquired) {
        // Slot is currently locked by a recent send from the same sender.
        // Reschedule job with minDelayMs + small jitter to yield to other senders
        const jitter = Math.floor(Math.random() * 300) + 200;
        const retryDelay = minDelayMs + jitter;
        console.log(`[EmailWorker] Sender ${sender.address} busy. Rescheduling email ${emailId} in ${retryDelay}ms`);
        await emailQueue.add(
          'send-email',
          { emailId },
          {
            jobId: `${email.id}:interval:${Date.now()}`,
            delay: retryDelay,
          }
        );
        return;
      }

      // 3. Hourly Rate Limiting: Atomic check via Redis Lua
      const { allowed } = await checkAndIncrementHourlyRate(
        sender.id,
        hourlyLimit
      );

      if (!allowed) {
        const { delayMs, nextHourDate } = getMsUntilNextHour();
        console.warn(
          `[EmailWorker] Hourly limit of ${hourlyLimit} reached for sender ${sender.address}. Rescheduling email ${emailId} to next hour (${delayMs}ms delay).`
        );

        // Update database status to RATE_LIMITED
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'RATE_LIMITED',
            retryCount: { increment: 1 },
          },
        });

        // Re-enqueue job into next hour window (order preserved by timestamp)
        await emailQueue.add(
          'send-email',
          { emailId },
          {
            jobId: `${email.id}:ratelimit:${nextHourDate.getTime()}`,
            delay: delayMs,
          }
        );

        // Trigger live Slack notification (debounced to 1 alert per window)
        await notifyRateLimitHit({
          userId: email.userId,
          senderId: sender.id,
          senderAddress: sender.address,
          hourlyLimit,
          rescheduledTime: nextHourDate,
        });

        return;
      }

      // 4. Optimistic Lock: Transition state to SENDING
      const updateResult = await prisma.email.updateMany({
        where: {
          id: emailId,
          status: { in: ['SCHEDULED', 'RATE_LIMITED'] },
        },
        data: {
          status: 'SENDING',
        },
      });

      if (updateResult.count === 0) {
        console.warn(`[EmailWorker] Email ${emailId} status changed concurrently. Skipping send.`);
        return;
      }

      // 5. Send Email via Ethereal SMTP
      try {
        console.log(`[EmailWorker] Sending email ${emailId} to ${email.toAddress} from ${sender.address}...`);
        const { etherealUrl } = await sendEmailViaEthereal(email, sender);

        const sentAt = new Date();
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'SENT',
            sentAt,
            etherealUrl,
          },
          include: { sender: true },
        });

        // Update Elasticsearch index
        await updateEmailStatusInIndex(emailId, 'SENT', sentAt);

        console.log(`[EmailWorker] ✅ Email ${emailId} successfully sent! Preview URL: ${etherealUrl}`);
      } catch (sendError: any) {
        console.error(`[EmailWorker] ❌ Failed to send email ${emailId}:`, sendError);

        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'FAILED',
            errorMessage: sendError?.message || 'SMTP Send Failed',
          },
        });

        await updateEmailStatusInIndex(emailId, 'FAILED');
        throw sendError; // BullMQ will handle retries if configured
      }
    },
    {
      connection: redisConnection,
      concurrency: env.WORKER_CONCURRENCY,
      limiter: {
        max: 1,
        duration: env.DELAY_BETWEEN_EMAILS_MS,
      },
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} failed with error:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[EmailWorker] Worker error:', err);
  });

  return worker;
}

/**
 * Startup recovery: Re-syncs all pending SCHEDULED or RATE_LIMITED emails from DB into BullMQ.
 * Thanks to jobId idempotency, already-queued jobs in Redis are untouched and no duplicates are created.
 */
export async function recoverPendingScheduledEmails() {
  try {
    const pendingEmails = await prisma.email.findMany({
      where: {
        status: { in: ['SCHEDULED', 'RATE_LIMITED'] },
      },
      include: { sender: true },
    });

    console.log(`[Recovery] Scanning database... Found ${pendingEmails.length} pending emails.`);

    let restoredCount = 0;
    const now = Date.now();

    for (const email of pendingEmails) {
      const scheduledTime = email.scheduledAt.getTime();
      const delay = Math.max(0, scheduledTime - now);

      await emailQueue.add(
        'send-email',
        { emailId: email.id },
        {
          jobId: email.id, // Idempotent! If already present in Redis, BullMQ ignores duplicate
          delay,
        }
      );

      // Also ensure indexed in Elasticsearch
      await indexEmail(email, email.sender);
      restoredCount++;
    }

    console.log(`[Recovery] Successfully verified/restored ${restoredCount} jobs in BullMQ.`);
  } catch (error) {
    console.error('[Recovery] Error restoring pending emails:', error);
  }
}
