import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { redisCommandClient } from '../config/redis';
import { esClient } from '../config/elasticsearch';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const status: Record<string, string> = {
    service: 'reachinbox-scheduler-backend',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    status.database = 'connected';
  } catch (err: any) {
    status.database = `error: ${err.message}`;
    status.status = 'degraded';
  }

  try {
    const ping = await redisCommandClient.ping();
    status.redis = ping === 'PONG' ? 'connected' : 'unexpected_response';
  } catch (err: any) {
    status.redis = `error: ${err.message}`;
    status.status = 'degraded';
  }

  try {
    const es = await esClient.ping();
    status.elasticsearch = es ? 'connected' : 'disconnected';
  } catch (err: any) {
    status.elasticsearch = `error: ${err.message}`;
    status.status = 'degraded';
  }

  const statusCode = status.status === 'healthy' ? 200 : 503;
  return res.status(statusCode).json(status);
});
