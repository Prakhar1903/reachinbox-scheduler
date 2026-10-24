import { esClient, EMAILS_INDEX, isElasticsearchAvailable } from '../config/elasticsearch';
import { Email, Sender } from '@prisma/client';
import { prisma } from '../config/db';

export interface EmailSearchDoc {
  id: string;
  userId: string;
  senderId: string;
  senderAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  createdAt: string;
}

export async function indexEmail(email: Email, sender?: Sender | null) {
  if (!isElasticsearchAvailable()) return;
  try {
    const senderAddress = sender?.address || '';
    const bodyText = (email.body || '').replace(/<[^>]*>/g, ' ');

    await esClient.index({
      index: EMAILS_INDEX,
      id: email.id,
      document: {
        id: email.id,
        userId: email.userId,
        senderId: email.senderId,
        senderAddress,
        toAddress: email.toAddress,
        subject: email.subject,
        body: bodyText,
        status: email.status,
        scheduledAt: email.scheduledAt.toISOString(),
        sentAt: email.sentAt ? email.sentAt.toISOString() : null,
        createdAt: email.createdAt.toISOString(),
      },
      refresh: 'wait_for',
    });
  } catch (error) {
    console.error(`[SearchService] Failed to index email ${email.id}:`, error);
  }
}

export async function updateEmailStatusInIndex(
  emailId: string,
  status: string,
  sentAt?: Date | null
) {
  if (!isElasticsearchAvailable()) return;
  try {
    await esClient.update({
      index: EMAILS_INDEX,
      id: emailId,
      doc: {
        status,
        sentAt: sentAt ? sentAt.toISOString() : null,
      },
      refresh: 'wait_for',
    });
  } catch (error) {
    console.error(`[SearchService] Failed to update email ${emailId} index:`, error);
  }
}

export async function searchEmails({
  userId,
  query,
  status,
  limit = 50,
}: {
  userId: string;
  query?: string;
  status?: string;
  limit?: number;
}) {
  if (isElasticsearchAvailable()) {
    const filterClauses: any[] = [{ term: { userId } }];
    if (status) {
      filterClauses.push({ term: { status } });
    }

    const mustClauses: any[] = [];
    if (query && query.trim().length > 0) {
      mustClauses.push({
        multi_match: {
          query: query.trim(),
          fields: ['subject^3', 'body', 'toAddress^2', 'senderAddress'],
          fuzziness: 'AUTO',
        },
      });
    } else {
      mustClauses.push({ match_all: {} });
    }

    try {
      const response = await esClient.search({
        index: EMAILS_INDEX,
        size: limit,
        query: {
          bool: {
            must: mustClauses,
            filter: filterClauses,
          },
        },
        sort: [{ scheduledAt: { order: 'desc' } }],
      });

      const hits = response.hits.hits.map((hit) => hit._source as EmailSearchDoc);
      return {
        total: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
        emails: hits,
      };
    } catch (error) {
      console.warn('[SearchService] Elasticsearch search query failed, using PostgreSQL fallback');
    }
  }

  // Graceful PostgreSQL Fallback
  try {
    const whereClause: any = { userId };
    if (status) {
      whereClause.status = status;
    }
    if (query && query.trim().length > 0) {
      const q = query.trim();
      whereClause.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
        { toAddress: { contains: q, mode: 'insensitive' } },
      ];
    }

    const emails = await prisma.email.findMany({
      where: whereClause,
      include: { sender: true },
      orderBy: { scheduledAt: 'desc' },
      take: limit,
    });

    return {
      total: emails.length,
      emails: emails.map((e) => ({
        id: e.id,
        userId: e.userId,
        senderId: e.senderId,
        senderAddress: e.sender.address,
        toAddress: e.toAddress,
        subject: e.subject,
        body: (e.body || '').replace(/<[^>]*>/g, ' '),
        status: e.status,
        scheduledAt: e.scheduledAt.toISOString(),
        sentAt: e.sentAt ? e.sentAt.toISOString() : null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  } catch (fallbackError) {
    console.error('[SearchService] Fallback DB query failed:', fallbackError);
    return { total: 0, emails: [] };
  }
}
