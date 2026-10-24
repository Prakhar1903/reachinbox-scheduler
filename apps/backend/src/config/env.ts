import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3001'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),

  GOOGLE_CLIENT_ID: z.string().default('764324481369-n5bohb1f626tl1u7d67o66sensbhgke1.apps.googleusercontent.com'),
  GOOGLE_CLIENT_SECRET: z.string().default('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'),
  GOOGLE_CALLBACK_URL: z.string().default('https://reachinbox-scheduler-g593.onrender.com/auth/google/callback'),

  JWT_SECRET: z.string().default('reachinbox_super_secret_jwt_key_2026_production_grade'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:4000/slack/oauth_redirect'),

  WORKER_CONCURRENCY: z.coerce.number().default(5),
  DELAY_BETWEEN_EMAILS_MS: z.coerce.number().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().default(200),
});

export const env = envSchema.parse(process.env);
