import { prisma } from './config/db';
import { emailQueue } from './queues/emailQueue';
import { esClient, EMAILS_INDEX, initElasticsearch } from './config/elasticsearch';
import { redisCommandClient } from './config/redis';

async function cleanAll() {
  console.log('🧹 Emptying emails database, queues, and search index...');

  // 1. Clear PostgreSQL emails
  const deletedEmails = await prisma.email.deleteMany({});
  console.log(`✅ Deleted ${deletedEmails.count} email record(s) from PostgreSQL.`);

  // 2. Obliterate BullMQ Queue jobs (delayed, waiting, active, failed, completed)
  try {
    await emailQueue.obliterate({ force: true });
    console.log('✅ Obliterated all BullMQ jobs and Redis queue state.');
  } catch (err: any) {
    console.warn('BullMQ obliterate warning:', err.message);
  }

  // 3. Clear Redis rate-limiting and mutex lock keys
  try {
    const keys = await redisCommandClient.keys('rate:*');
    const lockKeys = await redisCommandClient.keys('lock:*');
    const allKeys = [...keys, ...lockKeys];
    if (allKeys.length > 0) {
      await redisCommandClient.del(...allKeys);
      console.log(`✅ Deleted ${allKeys.length} Redis rate/lock keys.`);
    } else {
      console.log('✅ No Redis rate/lock keys found.');
    }
  } catch (err: any) {
    console.warn('Redis key cleanup warning:', err.message);
  }

  // 4. Reset Elasticsearch emails index
  try {
    const exists = await esClient.indices.exists({ index: EMAILS_INDEX });
    if (exists) {
      await esClient.indices.delete({ index: EMAILS_INDEX });
      console.log(`✅ Deleted Elasticsearch index "${EMAILS_INDEX}".`);
    }
    await initElasticsearch();
    console.log(`✅ Re-created fresh Elasticsearch index "${EMAILS_INDEX}".`);
  } catch (err: any) {
    console.warn('Elasticsearch cleanup warning:', err.message);
  }

  console.log('\n✨ Database, Queues, and Elasticsearch are completely fresh and empty!');
  process.exit(0);
}

cleanAll().catch((err) => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
