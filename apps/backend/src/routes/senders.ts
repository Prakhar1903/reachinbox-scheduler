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
