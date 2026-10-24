import { Router, Request, Response } from 'express';
import { WebClient } from '@slack/web-api';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { requireAuth } from '../middleware/requireAuth';

export const slackRouter = Router();

// 1. Generate Slack Install URL with signed state
slackRouter.get('/install', requireAuth, (req: Request, res: Response) => {
  const userId = req.user!.userId;
  // Sign state to prevent CSRF and identify user securely on callback
  const state = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '15m' });

  const scopes = ['chat:write', 'chat:write.public', 'incoming-webhook'].join(',');
  const redirectUri = encodeURIComponent(env.SLACK_REDIRECT_URI);
  const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${env.SLACK_CLIENT_ID}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

  return res.json({ url: slackAuthUrl });
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
  if (!token) {
    return res.status(400).json({ error: 'Slack token or webhook is required' });
  }

  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        slackToken: token,
        slackChannelId: channelId || 'general',
      },
    });

    return res.json({ success: true, message: 'Slack connected successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Disconnect Slack
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
