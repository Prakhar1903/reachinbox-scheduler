import { Client } from '@elastic/elasticsearch';
import { env } from './env';

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,
  requestTimeout: 2000,
});

export const EMAILS_INDEX = 'reachinbox_emails';

let esAvailable = false;

export function isElasticsearchAvailable() {
  return esAvailable;
}

export async function initElasticsearch() {
  try {
    const ping = await esClient.ping();
    if (!ping) {
      console.log('[Elasticsearch] Cluster unreachable. Operating with PostgreSQL search fallback.');
      esAvailable = false;
      return;
    }

    esAvailable = true;
    const indexExists = await esClient.indices.exists({ index: EMAILS_INDEX });
    if (!indexExists) {
      await esClient.indices.create({
        index: EMAILS_INDEX,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                email_analyzer: {
                  type: 'custom',
                  tokenizer: 'uax_url_email',
                  filter: ['lowercase'],
                },
              },
            },
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              userId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              senderAddress: { type: 'keyword' },
              toAddress: {
                type: 'text',
                analyzer: 'email_analyzer',
                fields: { keyword: { type: 'keyword' } },
              },
              subject: { type: 'text' },
              body: { type: 'text' },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              createdAt: { type: 'date' },
            },
          },
        },
      });
      console.log(`[Elasticsearch] Created index "${EMAILS_INDEX}"`);
    } else {
      console.log(`[Elasticsearch] Index "${EMAILS_INDEX}" is ready.`);
    }
  } catch (error) {
    esAvailable = false;
    console.log('[Elasticsearch] Cluster optional/unreachable. Operating with PostgreSQL search fallback.');
  }
}
