import { Router, Request, Response } from 'express';
import { WebClient } from '@slack/web-api';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { requireAuth } from '../middleware/requireAuth';

export const slackRouter = Router();

// 1. Generate Slack Install URL with signed state
slackRouter.get('/install', requireAuth, (req: Request, res: Response) => {
  if (!env.SLACK_CLIENT_ID || env.SLACK_CLIENT_ID === 'mock-slack-client-id') {
    return res.status(400).json({
      error:
        'Slack App Client ID is not configured yet. Please enter your Slack App Client ID and Client Secret, or use an Incoming Webhook URL.',
    });
  }

  const userId = req.user!.userId;
  // Sign state to prevent CSRF and identify user securely on callback
  const state = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '15m' });

  const scopes = ['chat:write', 'chat:write.public', 'incoming-webhook'].join(',');
  const redirectUri = encodeURIComponent(env.SLACK_REDIRECT_URI);
  const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${env.SLACK_CLIENT_ID}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

  return res.json({ url: slackAuthUrl });
});

// Configure Slack OAuth Credentials
slackRouter.post('/configure-oauth', requireAuth, async (req: Request, res: Response) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Both Client ID and Client Secret are required.' });
  }

  try {
    const cleanId = String(clientId).trim();
    const cleanSecret = String(clientSecret).trim();

    // Update runtime env
    (env as any).SLACK_CLIENT_ID = cleanId;
    (env as any).SLACK_CLIENT_SECRET = cleanSecret;

    // Persist to .env
    const fs = await import('fs');
    const path = await import('path');
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      content = content.replace(/SLACK_CLIENT_ID=.*/, `SLACK_CLIENT_ID=${cleanId}`);
      content = content.replace(/SLACK_CLIENT_SECRET=.*/, `SLACK_CLIENT_SECRET=${cleanSecret}`);
      fs.writeFileSync(envPath, content, 'utf8');
    }

    return res.json({ success: true, message: 'Slack OAuth credentials saved successfully!' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to save credentials' });
  }
});

// 2. Slack OAuth Callback
slackRouter.get('/oauth_redirect', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[Slack OAuth] Error callback:', error);
    return res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=${error}`);
  }

  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  try {
    const decoded = jwt.verify(String(state), env.JWT_SECRET) as { userId: string };
    const client = new WebClient();

    const response = await client.oauth.v2.access({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code: String(code),
      redirect_uri: env.SLACK_REDIRECT_URI,
    });

    if (!response.ok) {
      console.error('[Slack OAuth] Token exchange failed:', response.error);
      return res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=token_exchange_failed`);
    }

    const botToken = response.access_token as string;
    const teamId = response.team?.id;
    const channelId = (response.incoming_webhook as any)?.channel_id || null;

    await prisma.user.update({
      where: { id: decoded.userId },
      data: {
        slackToken: botToken,
        slackTeamId: teamId,
        slackChannelId: channelId,
      },
    });

    console.log(`[Slack OAuth] Successfully connected Slack for user ${decoded.userId}`);
    return res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err: any) {
    console.error('[Slack OAuth] Callback exception:', err);
    return res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=invalid_state`);
  }
});

// 3. Manual Webhook / Bot Token connection (for local demo without public Slack App redirects)
slackRouter.post('/connect-webhook', requireAuth, async (req: Request, res: Response) => {
  const { token, channelId } = req.body;
  const trimmedToken = (token || '').trim();

  if (!trimmedToken) {
    return res.status(400).json({ error: 'Slack token or webhook URL is required.' });
  }

  // Validate format
  const isWebhook = trimmedToken.startsWith('https://hooks.slack.com/services/');
  const isBotToken = trimmedToken.startsWith('xoxb-') || trimmedToken.startsWith('xoxp-');

  if (!isWebhook && !isBotToken) {
    return res.status(400).json({
      error:
        'Invalid credential. Please provide a Slack Incoming Webhook URL (https://hooks.slack.com/services/...) or a Bot Token (starts with xoxb-). Slack workspace URLs (like *.slack.com) cannot be used as tokens.',
    });
  }

  // 1. If it is an Incoming Webhook, ping Slack to verify it actually works before saving
  if (isWebhook) {
    try {
      const testRes = await fetch(trimmedToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🎉 *ReachInbox Integration Verified!* Slack notifications are now linked for ${req.user!.name || req.user!.email}.`,
        }),
      });

      const bodyText = await testRes.text();
      if (!testRes.ok || bodyText !== 'ok') {
        return res.status(400).json({
          error: `Slack rejected this Webhook URL (${bodyText || testRes.statusText}). Please check your Slack configuration.`,
        });
      }
    } catch (webhookErr: any) {
      console.error('[SlackConnect] Webhook test failed:', webhookErr.message);
      return res.status(400).json({
        error:
          'Could not reach Slack with this Webhook URL. Please verify you copied the full Webhook URL from your Slack App.',
      });
    }
  } else if (isBotToken) {
    // 2. If it is a Bot Token, test with Slack auth.test
    try {
      const client = new WebClient(trimmedToken);
      const authTest = await client.auth.test();
      if (!authTest.ok) {
        return res.status(400).json({
          error: `Slack Bot Token verification failed: ${authTest.error || 'Invalid token'}`,
        });
      }
    } catch (botErr: any) {
      console.error('[SlackConnect] Bot token verification failed:', botErr.data || botErr.message);
      return res.status(400).json({
        error: `Slack Bot Token was rejected by Slack: ${botErr.data?.error || botErr.message || 'invalid_auth'}`,
      });
    }
  }

  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        slackToken: trimmedToken,
        slackChannelId: channelId || 'general',
      },
    });

    return res.json({ success: true, message: 'Slack connected and verified successfully!' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Send Test Slack Notification
slackRouter.post('/test', requireAuth, async (req: Request, res: Response) => {
  let user: any = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { slackToken: true, slackChannelId: true, name: true, email: true },
    });

    if (!user || !user.slackToken) {
      return res.status(400).json({ error: 'Slack is not connected yet.' });
    }

    const { sendSlackNotification } = await import('../services/slackService');
    await sendSlackNotification({
      token: user.slackToken,
      channel: user.slackChannelId || 'general',
      text: `🎉 *ReachInbox Slack Integration Test*: Connected successfully for ${user.name || user.email}!`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎉 *ReachInbox Slack Integration Active*\nConnected successfully for *${user.name || user.email}*. You will receive automatic alerts whenever email sender rate limits are reached.`,
          },
        },
      ],
    });

    return res.json({ success: true, message: 'Test message sent to Slack channel!' });
  } catch (error: any) {
    console.error('[SlackRouter] Test notification failed:', error);
    const msg = error?.data?.error || error?.message || 'Failed to send Slack test message';
    if (msg.includes('invalid_auth')) {
      return res.status(400).json({
        error:
          'Slack returned "invalid_auth": The token or webhook provided is invalid. Please make sure to use an Incoming Webhook (https://hooks.slack.com/services/...) or a Bot Token starting with xoxb-.',
      });
    }
    if (msg.includes('channel_not_found')) {
      return res.status(400).json({
        error: `Slack returned "channel_not_found": Make sure the bot is invited to #${user?.slackChannelId} or use a public channel like #general.`,
      });
    }
    return res.status(400).json({ error: msg });
  }
});

// 5. Disconnect Slack
slackRouter.delete('/disconnect', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        slackToken: null,
        slackTeamId: null,
        slackChannelId: null,
      },
    });

    return res.json({ success: true, message: 'Slack disconnected' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
