import Redis from 'ioredis';
import { env } from './env';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const redisCommandClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

redisConnection.on('error', (err) => {
  console.error('[Redis Connection Error]:', err.message);
});

redisCommandClient.on('error', (err) => {
  console.error('[Redis Client Error]:', err.message);
});
