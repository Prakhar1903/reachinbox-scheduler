import { prisma } from './config/db';
import { emailQueue } from './queues/emailQueue';
import { indexEmail } from './services/searchService';

async function runLoadSimulation() {
  console.log('🚀 Starting 1,000 Email Scheduler Load Test...');

  // 1. Get or create test user and sender
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        googleId: 'test_load_user',
        email: 'load.test@reachinbox.ai',
        name: 'Load Tester',
      },
    });
  }

  const sender = await prisma.sender.findFirst();
  if (!sender) {
    console.error('No sender available. Please start the server once to seed senders.');
    process.exit(1);
  }

  const TOTAL_JOBS = 1000;
  const startTime = Date.now();
  const scheduledDate = new Date(startTime + 60 * 1000); // 1 minute in future

  console.log(`Scheduling ${TOTAL_JOBS} emails in batch...`);

  // Batch insert into database
  const emailsData = [];
  for (let i = 1; i <= TOTAL_JOBS; i++) {
    emailsData.push({
      userId: user.id,
      senderId: sender.id,
      toAddress: `lead_${i}_${Date.now()}@testoutreach.com`,
      subject: `Scale outreach prospect #${i}`,
      body: `<p>Personalized message for lead #${i}. Transforming cold email outreach with AI-driven workflows.</p>`,
      scheduledAt: scheduledDate,
      status: 'SCHEDULED' as const,
      delaySeconds: 1,
      hourlyLimit: 200,
    });
  }

  await prisma.email.createMany({ data: emailsData });
  console.log(`✅ Saved ${TOTAL_JOBS} records in PostgreSQL`);

  // Fetch created emails to get their UUIDs
  const createdEmails = await prisma.email.findMany({
    where: {
      userId: user.id,
      subject: { startsWith: 'Scale outreach prospect #' },
      status: 'SCHEDULED',
    },
    take: TOTAL_JOBS,
    orderBy: { createdAt: 'desc' },
  });

  // Bulk add to BullMQ with idempotency keys
  const bulkJobs = createdEmails.map((email) => ({
    name: 'send-email',
    data: { emailId: email.id },
    opts: {
      jobId: email.id,
      delay: Math.max(0, scheduledDate.getTime() - Date.now()),
    },
  }));

  await emailQueue.addBulk(bulkJobs);
  const durationMs = Date.now() - startTime;

  console.log(`✨ Successfully enqueued ${bulkJobs.length} jobs into BullMQ in ${durationMs}ms!`);
  const delayedCount = await emailQueue.getDelayedCount();
  console.log(`📊 BullMQ Delayed Queue Count: ${delayedCount}`);

  process.exit(0);
}

runLoadSimulation().catch((err) => {
  console.error('Load simulation error:', err);
  process.exit(1);
});
