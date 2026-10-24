import { WebClient } from '@slack/web-api';
import { prisma } from '../config/db';
import { redisCommandClient } from '../config/redis';

export async function sendSlackNotification({
  token,
  channel,
  text,
  blocks,
}: {
  token: string;
  channel: string;
  text: string;
  blocks?: any[];
}) {
  try {
    // If it's an Incoming Webhook URL
    if (token.startsWith('https://hooks.slack.com/')) {
      const response = await fetch(token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, blocks }),
      });
      console.log('[SlackService] Webhook notification delivered:', response.status);
      return { ok: response.ok };
    }

    // Standard Slack Bot Token (xoxb-...)
    const slack = new WebClient(token);
    const result = await slack.chat.postMessage({
      channel: channel || 'general',
      text,
      blocks,
    });
    console.log(`[SlackService] Notification posted to channel ${channel}:`, result.ts);
    return result;
  } catch (error: any) {
    console.error('[SlackService] Failed to post Slack message:', error?.message || error);
    throw error;
  }
}

export async function notifyRateLimitHit({
  userId,
  senderId,
  senderAddress,
  hourlyLimit,
  rescheduledTime,
}: {
  userId: string;
  senderId?: string;
  senderAddress: string;
  hourlyLimit: number;
  rescheduledTime: Date;
}) {
  try {
    // Alert deduplication / throttling: Only alert ONCE per sender per hour window
    if (senderId) {
      const windowKey = `slack:alert:ratelimit:${senderId}:${rescheduledTime.getTime()}`;
      // Atomically set key with TTL. If already set, returns null (skip sending duplicate alerts)
      const lockAcquired = await redisCommandClient.set(windowKey, '1', 'EX', 3600, 'NX');
      if (lockAcquired !== 'OK') {
        return; // Alert already dispatched to Slack for this window
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { slackToken: true, slackChannelId: true, name: true, email: true },
    });

    if (!user || !user.slackToken) {
      console.log(`[SlackService] User ${userId} has not connected Slack. Skipping notification.`);
      return;
    }

    const channel = user.slackChannelId || 'general';
    const timeFormatted = rescheduledTime.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const text = `🚨 *ReachInbox Rate Limit Alert*: Sender \`${senderAddress}\` reached hourly limit of ${hourlyLimit} emails. Remaining emails rescheduled to *${timeFormatted}*.`;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Email Scheduler Rate Limit Alert',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Sender Address:*\n\`${senderAddress}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Hourly Limit:*\n${hourlyLimit} emails/hr`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `The rate limit was hit. *No emails were dropped.* All excess scheduled jobs have been automatically moved to the next available window at *${timeFormatted}*.`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Scheduler: ReachInbox BullMQ System • User: ${user.name || user.email}`,
          },
        ],
      },
    ];

    await sendSlackNotification({
      token: user.slackToken,
      channel,
      text,
      blocks,
    });
  } catch (error) {
    console.error('[SlackService] Error in notifyRateLimitHit:', error);
  }
}
