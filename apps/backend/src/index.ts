import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { env } from './config/env';
import { emailQueue } from './queues/emailQueue';
import { createEmailWorker, recoverPendingScheduledEmails } from './queues/emailWorker';
import { initElasticsearch } from './config/elasticsearch';
import { ensureDefaultSenders } from './services/senderService';
import { authRouter } from './routes/auth';
import { emailsRouter } from './routes/emails';
import { sendersRouter } from './routes/senders';
import { slackRouter } from './routes/slack';
import { healthRouter } from './routes/health';
import { requireAuth } from './middleware/requireAuth';

const app = express();

// Middlewares
app.use(
  cors({
    origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(passport.initialize());

// Bull Board UI for queue visibility (protected by authentication)
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue as any) as any],
  serverAdapter,
});

// Guard Bull Board: require auth or redirect to login
app.use(
  '/admin/queues',
  (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.jwt || req.headers.authorization?.split(' ')[1];
    if (!token) {
      if (req.accepts('html')) {
        return res.redirect(`${env.FRONTEND_URL}/login?returnUrl=/admin/queues`);
      }
      return res.status(401).json({ error: 'Unauthorized: login required to access BullMQ dashboard' });
    }
    return requireAuth(req, res, next);
  },
  serverAdapter.getRouter()
);

// Mount Application Routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/senders', sendersRouter);
app.use('/slack', slackRouter);

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Server Error]:', err);
  return res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

let workerInstance: ReturnType<typeof createEmailWorker> | null = null;

async function bootstrap() {
  try {
    console.log('🚀 Starting ReachInbox Email Scheduler Service...');

    // 1. Initialize Elasticsearch index
    await initElasticsearch();

    // 2. Ensure test Ethereal senders are seeded
    await ensureDefaultSenders();

    // 3. Start BullMQ Worker
    workerInstance = createEmailWorker();
    console.log(`[Worker] Started BullMQ worker with concurrency=${env.WORKER_CONCURRENCY}`);

    // 4. Recover any scheduled/rate-limited emails (idempotent restart safety)
    await recoverPendingScheduledEmails();

    // 5. Start Express server
    const server = app.listen(env.PORT, () => {
      console.log(`\n======================================================`);
      console.log(`✨ Backend API running at http://localhost:${env.PORT}`);
      console.log(`📊 Bull Board UI running at http://localhost:${env.PORT}/admin/queues`);
      console.log(`⚡ Health probe at http://localhost:${env.PORT}/health`);
      console.log(`======================================================\n`);
    });

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n[Shutdown] Received ${signal}. Gracefully stopping...`);
      server.close();
      if (workerInstance) {
        await workerInstance.close();
      }
      await emailQueue.close();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Fatal initialization error:', error);
    process.exit(1);
  }
}

bootstrap();
