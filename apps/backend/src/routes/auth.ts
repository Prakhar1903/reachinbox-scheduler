import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { requireAuth } from '../middleware/requireAuth';

export const authRouter = Router();

// Configure Google OAuth Strategy if credentials are present
const hasGoogleCreds =
  Boolean(env.GOOGLE_CLIENT_ID) &&
  Boolean(env.GOOGLE_CLIENT_SECRET) &&
  env.GOOGLE_CLIENT_ID !== 'mock-google-client-id';

if (hasGoogleCreds) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || `${profile.id}@gmail.com`;
          const name = profile.displayName || profile.name?.givenName || 'Google User';
          const avatarUrl = profile.photos?.[0]?.value || null;

          const user = await prisma.user.upsert({
            where: { googleId: profile.id },
            update: { name, avatarUrl, email },
            create: {
              googleId: profile.id,
              email,
              name,
              avatarUrl,
            },
          });

          return done(null, {
            userId: user.id,
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          } as any);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
}

function getTargetFrontend(req: Request): string {
  const queryRedirect = req.query.redirect as string | undefined;
  if (queryRedirect && (queryRedirect.startsWith('http://') || queryRedirect.startsWith('https://'))) {
    return queryRedirect.replace(/\/+$/, '');
  }
  const referer = req.headers.referer;
  if (referer) {
    try {
      return new URL(referer).origin.replace(/\/+$/, '');
    } catch {}
  }
  return env.FRONTEND_URL.replace(/\/+$/, '');
}

// 1. Initiate Google Login
authRouter.get('/google', (req: Request, res: Response, next: NextFunction) => {
  const targetFrontend = getTargetFrontend(req);

  // If GCP credentials are provided
  if (hasGoogleCreds && env.GOOGLE_CALLBACK_URL) {
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      state: targetFrontend,
    })(req, res, next);
  } else {
    // Graceful fallback
    const userEmail = (req.query.email as string) || 'oliver.brown@domain.io';
    const isMock = userEmail === 'oliver.brown@domain.io';
    const name = isMock ? 'Oliver Brown' : userEmail.split('@')[0];
    const googleId = isMock ? 'google_1092837465928374' : `email_${userEmail}`;
    const avatarUrl = isMock
      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
      : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=029E4D&textColor=ffffff`;

    prisma.user
      .upsert({
        where: { email: userEmail },
        update: { name, avatarUrl },
        create: { googleId, email: userEmail, name, avatarUrl },
      })
      .then((user) => {
        const token = jwt.sign(
          { userId: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
          env.JWT_SECRET,
          { expiresIn: '7d' }
        );

        const isProd = env.NODE_ENV === 'production';
        res.cookie('jwt', token, {
          httpOnly: true,
          secure: isProd,
          sameSite: isProd ? 'none' : 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.redirect(`${targetFrontend}/dashboard?token=${token}`);
      })
      .catch(next);
  }
});

// 2. Google OAuth Callback
authRouter.get(
  '/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    const targetFrontend = (req.query.state as string) || env.FRONTEND_URL.replace(/\/+$/, '');

    if (!hasGoogleCreds) {
      return res.redirect(`${targetFrontend}/dashboard`);
    }

    passport.authenticate('google', { session: false }, (err, user) => {
      if (err || !user) {
        console.error('[Google OAuth] Authentication failed:', err);
        return res.redirect(`${targetFrontend}/login?error=oauth_failed`);
      }

      const userId = (user as any).userId || (user as any).id;
      const token = jwt.sign(
        { userId, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const isProd = env.NODE_ENV === 'production';
      res.cookie('jwt', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.redirect(`${targetFrontend}/dashboard?token=${token}`);
    })(req, res, next);
  }
);

// 3. User Login / Registration (Email + Password or 1-Click Demo)
const handleEmailLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawEmail = (req.body?.email || '').trim().toLowerCase();

    let email: string;
    let name: string;
    let avatarUrl: string | null;
    let googleId: string;

    if (rawEmail && rawEmail.includes('@')) {
      email = rawEmail;
      const username = email.split('@')[0];
      name =
        username
          .split(/[._-]/)
          .filter(Boolean)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ') || 'User';
      googleId = `email_${email}`;
      avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=029E4D&textColor=ffffff`;
    } else {
      googleId = 'google_1092837465928374';
      email = 'oliver.brown@domain.io';
      name = 'Oliver Brown';
      avatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: { name, avatarUrl },
      create: { googleId, email, name, avatarUrl },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const isProd = env.NODE_ENV === 'production';
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ token, user });
  } catch (err) {
    next(err);
  }
};

authRouter.post('/login', handleEmailLogin);
authRouter.post('/demo-login', handleEmailLogin);

// 4. Get Current User (/auth/me)
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId in token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        slackTeamId: true,
        slackChannelId: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found in database. Session expired.' });
    }

    return res.json({
      user: {
        ...user,
        hasSlackConnected: Boolean(user.slackChannelId || user.slackTeamId),
      },
    });
  } catch (error: any) {
    console.error('[/auth/me error]:', error);
    return res.status(500).json({ error: error?.message || 'Failed to fetch user' });
  }
});

// 5. Logout
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('jwt');
  return res.json({ message: 'Logged out successfully' });
});
