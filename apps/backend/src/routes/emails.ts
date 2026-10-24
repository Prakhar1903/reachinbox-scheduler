import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { requireAuth } from '../middleware/requireAuth';
import { scheduleEmailJob } from '../queues/emailQueue';
import { indexEmail, searchEmails } from '../services/searchService';
import { env } from '../config/env';

export const emailsRouter = Router();

const scheduleEmailSchema = z.object({
  senderId: z.string().uuid(),
  toAddresses: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  scheduledAt: z.string().datetime().or(z.string()),
  delaySeconds: z.coerce.number().min(0).default(2),
  hourlyLimit: z.coerce.number().min(1).default(200),
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

    const createdEmails = [];

    // Create DB records and enqueue jobs
    for (const toAddress of parsed.toAddresses) {
      const email = await prisma.email.create({
        data: {
          userId,
          senderId: parsed.senderId,
          toAddress,
          subject: parsed.subject,
          body: parsed.body,
          scheduledAt: scheduledDate,
          status: 'SCHEDULED',
          delaySeconds: parsed.delaySeconds || env.DELAY_BETWEEN_EMAILS_MS / 1000,
          hourlyLimit: parsed.hourlyLimit || env.MAX_EMAILS_PER_HOUR_PER_SENDER,
        },
      });

      // BullMQ Schedule with Idempotency Guard (jobId = email.id)
      const job = await scheduleEmailJob(email.id, scheduledDate);

      // Save bullJobId
      await prisma.email.update({
        where: { id: email.id },
        data: { bullJobId: String(job.id) },
      });

      // Index in Elasticsearch
      await indexEmail(email, sender);

      createdEmails.push(email);
    }

    return res.status(201).json({
      message: `Successfully scheduled ${createdEmails.length} email(s)`,
      count: createdEmails.length,
      emails: createdEmails,
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
