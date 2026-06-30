/**
 * Router Auth: login, refresh, logout, current user.
 * Handles email/password authentication with JWT tokens.
 */

import { Router } from 'express';
import crypto from 'crypto';
import type { WorkerContext } from '../worker-context.js';
import type { AuthenticatedRequest } from '../middleware/auth-middleware.js';
import {
  requireAuth,
  isAuthEnabled,
  signJwt,
  verifyJwt,
  getJwtSecret,
} from '../middleware/auth-middleware.js';
import {
  getUserByEmail,
  getUserById,
  updateUserLastLogin,
  createAuthSession,
  getSessionByRefreshToken,
  deleteAuthSession,
  logAction,
  toPublicUser,
  countAdmins,
} from '../sqlite/Users.js';

// Token TTL constants
const ACCESS_TOKEN_TTL = 3600;          // 1 hour
const REFRESH_TOKEN_TTL = 7 * 24 * 3600; // 7 days

/** Extract client IP safely from Express request. */
function getClientIp(req: { ip?: string | string[] }): string | null {
  const ip = req.ip;
  if (Array.isArray(ip)) return ip[0] ?? null;
  return ip ?? null;
}

/**
 * Verify password against bcrypt hash.
 * Uses timing-safe comparison for constant-time validation.
 * Falls back to crypto.timingSafeEqual with SHA-256 if bcryptjs is not available.
 */
async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    // Dynamic import of bcryptjs (optional dependency)
    const bcrypt = await import('bcryptjs');
    return bcrypt.compareSync(plaintext, hash);
  } catch {
    // Fallback: if the hash was created with our SHA-256 fallback
    const testHash = crypto.createHash('sha256').update(plaintext).digest('hex');
    if (hash.length === 64) {
      return crypto.timingSafeEqual(Buffer.from(testHash), Buffer.from(hash));
    }
    return false;
  }
}

export function createAuthRouter(ctx: WorkerContext): Router {
  const router = Router();

  /**
   * POST /api/auth/login
   * Authenticate with email/password, returns access + refresh tokens.
   */
  router.post('/api/auth/login', async (req, res) => {
    if (!isAuthEnabled()) {
      res.status(400).json({ error: 'Authentication is not enabled. Set auth.enabled=true in config.' });
      return;
    }

    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = getUserByEmail(ctx.db.db, email.toLowerCase().trim());
    if (!user) {
      // Constant-time: still hash something to prevent timing attacks
      await verifyPassword(password, '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123');
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      logAction(ctx.db.db, user.id, 'login_failed', user.email, null, getClientIp(req));
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate tokens
    const secret = getJwtSecret();
    const accessToken = signJwt(
      { sub: user.id, email: user.email, role: user.role },
      secret,
      ACCESS_TOKEN_TTL
    );

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL * 1000).toISOString();
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL * 1000).toISOString();

    // Store session
    createAuthSession(ctx.db.db, user.id, accessToken, refreshToken, expiresAt, refreshExpiresAt);
    updateUserLastLogin(ctx.db.db, user.id);
    logAction(ctx.db.db, user.id, 'login', user.email, null, getClientIp(req));

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL,
      user: toPublicUser(user),
    });
  });

  /**
   * POST /api/auth/refresh
   * Exchange refresh token for a new access token.
   */
  router.post('/api/auth/refresh', async (req, res) => {
    if (!isAuthEnabled()) {
      res.status(400).json({ error: 'Authentication is not enabled' });
      return;
    }

    const { refresh_token } = req.body || {};
    if (!refresh_token || typeof refresh_token !== 'string') {
      res.status(400).json({ error: 'refresh_token is required' });
      return;
    }

    const session = getSessionByRefreshToken(ctx.db.db, refresh_token);
    if (!session) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    // Check refresh token expiry
    if (new Date(session.refresh_expires_at) < new Date()) {
      deleteAuthSession(ctx.db.db, session.token);
      res.status(401).json({ error: 'Refresh token expired' });
      return;
    }

    // Load user
    const user = getUserById(ctx.db.db, session.user_id);
    if (!user || !user.is_active) {
      deleteAuthSession(ctx.db.db, session.token);
      res.status(401).json({ error: 'User not found or deactivated' });
      return;
    }

    // Delete old session, issue new tokens
    deleteAuthSession(ctx.db.db, session.token);

    const secret = getJwtSecret();
    const newAccessToken = signJwt(
      { sub: user.id, email: user.email, role: user.role },
      secret,
      ACCESS_TOKEN_TTL
    );

    const newRefreshToken = crypto.randomBytes(48).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL * 1000).toISOString();
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL * 1000).toISOString();

    createAuthSession(ctx.db.db, user.id, newAccessToken, newRefreshToken, expiresAt, refreshExpiresAt);

    res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL,
    });
  });

  /**
   * POST /api/auth/logout
   * Invalidate the current session.
   */
  router.post('/api/auth/logout', requireAuth(ctx), (req: AuthenticatedRequest, res) => {
    if (!isAuthEnabled()) {
      res.json({ ok: true });
      return;
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      deleteAuthSession(ctx.db.db, token);
      if (req.userId) {
        logAction(ctx.db.db, req.userId, 'logout', req.user?.email ?? null, null, getClientIp(req));
      }
    }

    res.json({ ok: true });
  });

  /**
   * GET /api/auth/me
   * Returns current user info.
   */
  router.get('/api/auth/me', requireAuth(ctx), (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    res.json({
      user: req.user,
      auth_enabled: isAuthEnabled(),
      has_admin: countAdmins(ctx.db.db) > 0,
    });
  });

  /**
   * GET /api/auth/status
   * Public endpoint: check if auth is enabled and if admin exists.
   */
  router.get('/api/auth/status', (_req, res) => {
    res.json({
      auth_enabled: isAuthEnabled(),
      has_admin: countAdmins(ctx.db.db) > 0,
    });
  });

  return router;
}
