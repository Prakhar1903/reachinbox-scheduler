import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getAllSenders, ensureDefaultSenders } from '../services/senderService';

export const sendersRouter = Router();

sendersRouter.get('/', requireAuth, async (_req: Request, res: Response) => {
  try {
    let senders = await getAllSenders();
    if (senders.length === 0) {
      senders = await ensureDefaultSenders();
    }
    return res.json({ senders });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch senders' });
  }
});

sendersRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { address, name, smtpHost, smtpPort, smtpUser, smtpPass } = req.body;
    if (!address || !smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return res.status(400).json({
        error: 'Missing required SMTP fields (address, smtpHost, smtpPort, smtpUser, smtpPass)',
      });
    }

    const { prisma } = await import('../config/db');
    const sender = await prisma.sender.upsert({
      where: { address },
      update: {
        name: name || address,
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpUser,
        smtpPass,
      },
      create: {
        address,
        name: name || address,
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpUser,
        smtpPass,
      },
    });

    return res.status(201).json({ sender });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
