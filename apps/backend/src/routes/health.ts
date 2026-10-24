import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { redisCommandClient } from '../config/redis';
import { esClient, isElasticsearchAvailable } from '../config/elasticsearch';

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
  }

  try {
    const ping = await redisCommandClient.ping();
    status.redis = ping === 'PONG' ? 'connected' : 'unexpected_response';
  } catch (err: any) {
    status.redis = `error: ${err.message}`;
  }

  if (isElasticsearchAvailable()) {
    try {
      const es = await esClient.ping();
      status.elasticsearch = es ? 'connected' : 'fallback_postgres';
    } catch (_err) {
      status.elasticsearch = 'fallback_postgres';
    }
  } else {
    status.elasticsearch = 'fallback_postgres';
  }

  const isHealthy = status.database === 'connected' && status.redis === 'connected';
  status.status = isHealthy ? 'healthy' : 'degraded';

  const statusCode = isHealthy ? 200 : 503;
  return res.status(statusCode).json(status);
});
