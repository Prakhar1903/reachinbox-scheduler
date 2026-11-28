import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { redisCommandClient } from '../config/redis';
import { esClient, isElasticsearchAvailable } from '../config/elasticsearch';

export const healthRouter = Router();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

healthRouter.get('/', async (req: Request, res: Response) => {
  const status: Record<string, string> = {
    service: 'reachinbox-scheduler-backend',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 2500, 'Postgres check');
    status.database = 'connected';
  } catch (err: any) {
    status.database = `error: ${err.message}`;
  }

  try {
    const ping = await withTimeout(redisCommandClient.ping(), 2500, 'Redis check');
    status.redis = ping === 'PONG' ? 'connected' : 'unexpected_response';
  } catch (err: any) {
    status.redis = `error: ${err.message}`;
  }

  if (isElasticsearchAvailable()) {
    try {
      const es = await withTimeout(esClient.ping(), 1500, 'Elasticsearch check');
      status.elasticsearch = es ? 'connected' : 'fallback_postgres';
    } catch (_err) {
      status.elasticsearch = 'fallback_postgres';
    }
  } else {
    status.elasticsearch = 'fallback_postgres';
  }

  const isHealthy = status.database === 'connected' && status.redis === 'connected';
  status.status = isHealthy ? 'healthy' : 'degraded';

  // Return 200 by default so Render health checks keep auth routes online while surfacing degraded details
  const strict = req.query.strict === 'true';
  const statusCode = strict && !isHealthy ? 503 : 200;
  return res.status(statusCode).json(status);
});
