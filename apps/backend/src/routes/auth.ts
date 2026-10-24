import { Router, Request, Response } from 'express';
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
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          });
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
}

// 1. Initiate Google Login
authRouter.get('/google', (req: Request, res: Response, next) => {
  if (hasGoogleCreds) {
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
    })(req, res, next);
  } else {
    // Graceful fallback for local development without pre-configured GCP credentials
    // Matches Oliver Brown in the Figma mockups!
    const mockGoogleId = 'google_1092837465928374';
    const email = 'oliver.brown@domain.io';
    const name = 'Oliver Brown';
    const avatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

    prisma.user
      .upsert({
        where: { googleId: mockGoogleId },
        update: { name, email, avatarUrl },
        create: { googleId: mockGoogleId, email, name, avatarUrl },
      })
      .then((user) => {
        const token = jwt.sign(
          { userId: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
          env.JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.cookie('jwt', token, {
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.redirect(`${env.FRONTEND_URL}/dashboard?token=${token}`);
      })
      .catch(next);
  }
});

// 2. Google OAuth Callback
authRouter.get(
  '/google/callback',
  (req: Request, res: Response, next) => {
    if (!hasGoogleCreds) {
      return res.redirect(`${env.FRONTEND_URL}/dashboard`);
    }

    passport.authenticate('google', { session: false }, (err, user) => {
      if (err || !user) {
        return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('jwt', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.redirect(`${env.FRONTEND_URL}/dashboard?token=${token}`);
    })(req, res, next);
  }
);

// 3. Demo Login Route for quick testing (matches Figma default user)
authRouter.post('/demo-login', async (_req: Request, res: Response) => {
  const mockGoogleId = 'google_1092837465928374';
  const email = 'oliver.brown@domain.io';
  const name = 'Oliver Brown';
  const avatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

  const user = await prisma.user.upsert({
    where: { googleId: mockGoogleId },
    update: { name, email, avatarUrl },
    create: { googleId: mockGoogleId, email, name, avatarUrl },
  });

  const token = jwt.sign(
    { userId: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('jwt', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({ token, user });
});

// 4. Get Current User (/auth/me)
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
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
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({
    user: {
      ...user,
      hasSlackConnected: Boolean(user.slackChannelId || user.slackTeamId),
    },
  });
});

// 5. Logout
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('jwt');
  return res.json({ message: 'Logged out successfully' });
});
