import { WebClient } from '@slack/web-api';
import { prisma } from '../config/db';

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
    const slack = new WebClient(token);
    const result = await slack.chat.postMessage({
      channel,
      text,
      blocks,
    });
    console.log(`[SlackService] Notification posted to channel ${channel}:`, result.ts);
    return result;
  } catch (error: any) {
    console.error('[SlackService] Failed to post Slack message:', error?.message || error);
    return null;
  }
}

export async function notifyRateLimitHit({
  userId,
  senderAddress,
  hourlyLimit,
  rescheduledTime,
}: {
  userId: string;
  senderAddress: string;
  hourlyLimit: number;
  rescheduledTime: Date;
}) {
  try {
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
