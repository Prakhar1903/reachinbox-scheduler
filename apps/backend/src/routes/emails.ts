import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { requireAuth } from '../middleware/requireAuth';
import { scheduleEmailJob, emailQueue } from '../queues/emailQueue';
import { indexEmail, searchEmails } from '../services/searchService';
import { env } from '../config/env';

export const emailsRouter = Router();

const scheduleEmailSchema = z.object({
  senderId: z.string().uuid(),
  toAddresses: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  scheduledAt: z.string().datetime().or(z.string()),
  delaySeconds: z
    .coerce
    .number()
    .int('Delay must be an integer')
    .min(1, 'Minimum delay between emails is 1 second')
    .max(3600, 'Maximum delay between emails is 3,600 seconds (1 hour)')
    .default(2),
  hourlyLimit: z
    .coerce
    .number()
    .int('Hourly limit must be an integer')
    .min(1, 'Minimum hourly limit is 1 email/hr')
    .max(2000, 'Maximum hourly limit is 2,000 emails/hr')
    .default(200),
  attachments: z
    .array(
      z.object({
        id: z.string().optional(),
        filename: z.string(),
        size: z.string().optional(),
        contentType: z.string().optional(),
        dataUrl: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

// 1. Schedule one or bulk emails
emailsRouter.post('/schedule', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = scheduleEmailSchema.parse(req.body);
    const userId = req.user!.userId;

    // Verify sender exists
    const sender = await prisma.sender.findUnique({
      where: { id: parsed.senderId },
    });

    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const scheduledDate = new Date(parsed.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt date format' });
    }

    // Strict validation: Reject past scheduled dates (allowing 60s network transit / clock drift buffer)
    const now = Date.now();
    if (scheduledDate.getTime() < now - 60000) {
      return res.status(400).json({
        error: 'Scheduled time cannot be in the past. Please select a future date and time.',
      });
    }

    const delayMs = Math.max(0, scheduledDate.getTime() - Date.now());
    const delaySeconds = parsed.delaySeconds || env.DELAY_BETWEEN_EMAILS_MS / 1000;
    const hourlyLimit = parsed.hourlyLimit || env.MAX_EMAILS_PER_HOUR_PER_SENDER;
    const attachments = parsed.attachments.length > 0 ? (parsed.attachments as any) : undefined;

    // Pre-generate UUIDs for high-throughput bulk insertion
    const emailRecords = parsed.toAddresses.map((toAddress) => {
      const emailId = crypto.randomUUID();
      return {
        id: emailId,
        userId,
        senderId: parsed.senderId,
        toAddress,
        subject: parsed.subject,
        body: parsed.body,
        attachments,
        scheduledAt: scheduledDate,
        status: 'SCHEDULED' as const,
        bullJobId: emailId,
        delaySeconds,
        hourlyLimit,
      };
    });

    // 1. Bulk insert all records into PostgreSQL in a single query
    await prisma.email.createMany({
      data: emailRecords,
    });

    // 2. Bulk enqueue all jobs into BullMQ Redis in a single pipeline
    const bulkJobs = emailRecords.map((email) => ({
      name: 'send-email',
      data: { emailId: email.id },
      opts: {
        jobId: email.id,
        delay: delayMs,
      },
    }));
    await emailQueue.addBulk(bulkJobs);

    // 3. Background non-blocking index in Elasticsearch
    Promise.allSettled(emailRecords.map((email) => indexEmail(email as any, sender))).catch(() => {});

    return res.status(201).json({
      message: `Successfully scheduled ${emailRecords.length} email(s)`,
      count: emailRecords.length,
      emails: emailRecords,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Validation failed' });
    }
    console.error('[EmailsRouter] Schedule error:', error);
    return res.status(500).json({ error: error.message || 'Failed to schedule emails' });
  }
});

// 2. List Emails (with stats for sidebar counts)
emailsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { status, page = '1', limit = '50' } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
    const skip = (pageNum - 1) * take;

    const where: any = { userId };
    if (status && status !== 'ALL') {
      if (status === 'SCHEDULED') {
        where.status = { in: ['SCHEDULED', 'RATE_LIMITED', 'SENDING'] };
      } else if (status === 'SENT') {
        where.status = 'SENT';
      } else {
        where.status = String(status);
      }
    }

    const [emails, totalCount, scheduledCount, sentCount] = await Promise.all([
      prisma.email.findMany({
        where,
        include: { sender: true },
        orderBy: { scheduledAt: 'desc' },
        skip,
        take,
      }),
      prisma.email.count({ where }),
      prisma.email.count({
        where: {
          userId,
          status: { in: ['SCHEDULED', 'RATE_LIMITED', 'SENDING'] },
        },
      }),
      prisma.email.count({
        where: { userId, status: 'SENT' },
      }),
    ]);

    return res.json({
      emails,
      pagination: {
        page: pageNum,
        limit: take,
        total: totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
      stats: {
        scheduled: scheduledCount,
        sent: sentCount,
      },
    });
  } catch (error: any) {
    console.error('[EmailsRouter] List error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch emails' });
  }
});

// 3. Search Emails via Elasticsearch
emailsRouter.get('/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { q, status, limit } = req.query;

    const result = await searchEmails({
      userId,
      query: q ? String(q) : undefined,
      status: status ? String(status) : undefined,
      limit: limit ? parseInt(String(limit), 10) : 50,
    });

    return res.json(result);
  } catch (error: any) {
    console.error('[EmailsRouter] Search error:', error);
    return res.status(500).json({ error: error.message || 'Search failed' });
  }
});

// 4. Get Single Email Details
emailsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const email = await prisma.email.findFirst({
      where: { id: req.params.id, userId },
      include: { sender: true },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    return res.json({ email });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Toggle Star Email
emailsRouter.patch('/:id/star', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const email = await prisma.email.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { isStarred: !email.isStarred },
    });
    return res.json({ isStarred: updated.isStarred });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 6. Toggle Archive Email
emailsRouter.patch('/:id/archive', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const email = await prisma.email.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { isArchived: !email.isArchived },
    });
    return res.json({ isArchived: updated.isArchived });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 7. Delete Email
emailsRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const email = await prisma.email.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Remove from BullMQ queue if pending
    if (email.status === 'SCHEDULED' || email.status === 'RATE_LIMITED') {
      try {
        const { emailQueue } = await import('../queues/emailQueue');
        const jobId = email.bullJobId || email.id;
        const job = await emailQueue.getJob(jobId);
        if (job) {
          await job.remove();
        }
      } catch (queueErr) {
        console.warn('[Queue Remove Warning]:', queueErr);
      }
    }

    // Remove from Elasticsearch
    try {
      const { esClient, EMAILS_INDEX } = await import('../config/elasticsearch');
      await esClient.delete({
        index: EMAILS_INDEX,
        id: email.id,
      });
    } catch (esErr) {
      // safe ignore
    }

    // Remove from database
    await prisma.email.delete({
      where: { id: email.id },
    });

    return res.json({ success: true, message: 'Email deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
