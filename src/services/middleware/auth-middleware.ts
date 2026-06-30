/**
 * Auth middleware for multi-user mode.
 *
 * When auth.enabled is false (default), all requests pass through unrestricted.
 * When enabled, validates JWT tokens and enforces role-based access control.
 */

import type { Request, Response, NextFunction } from 'express';
import type { WorkerContext } from '../worker-context.js';
import type { UserRole, UserPublic } from '../sqlite/Users.js';
import { getUserById, toPublicUser } from '../sqlite/Users.js';
import { getConfigValue } from '../../cli/cli-utils.js';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';

// ── JWT (lightweight HMAC-SHA256 implementation) ──
// Avoids external dependency for simple token validation.

const JWT_SECRET_KEY = 'auth.jwt_secret';
const JWT_ALGORITHM = 'HS256';

export interface JWTPayload {
  sub: string;      // user_id
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: UserPublic;
  userId?: string;
}

// ── JWT Helpers ──

function base64UrlEncode(data: string): string {
  return Buffer.from(data, 'utf8').toString('base64url');
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function createHmacSignature(input: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

export function getJwtSecret(): string {
  const configured = getConfigValue(JWT_SECRET_KEY) as string | null;
  if (configured && typeof configured === 'string' && configured.length >= 32) {
    return configured;
  }
  // Auto-generate and persist a secret if not set
  const generated = crypto.randomBytes(48).toString('hex');
  // We can't call setConfigValue here (circular dep risk), so return generated
  // The worker-service will persist this on first boot with auth enabled
  return generated;
}

export function signJwt(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresInSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: JWT_ALGORITHM, typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createHmacSignature(`${header}.${body}`, secret);

  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JWTPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  if (!header || !body || !signature) return null;

  // Verify signature
  const expectedSignature = createHmacSignature(`${header}.${body}`, secret);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  // Decode and validate payload
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as JWTPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ── Auth Middleware ──

export function isAuthEnabled(): boolean {
  const value = getConfigValue('auth.enabled');
  return value === true || value === 'true';
}

/**
 * Middleware: require authentication.
 * If auth is disabled (single-user mode), attaches a synthetic admin user and passes through.
 */
export function requireAuth(ctx: WorkerContext) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Single-user mode: skip all auth
    if (!isAuthEnabled()) {
      req.user = {
        id: 'local-user',
        email: 'local@localhost',
        role: 'admin',
        display_name: 'Local User',
        avatar_url: null,
        is_active: 1,
        created_at: new Date().toISOString(),
        last_login: null,
      };
      req.userId = 'local-user';
      next();
      return;
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.slice(7);
    const secret = getJwtSecret();
    const payload = verifyJwt(token, secret);

    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Load user from DB to get current role (may have changed)
    const user = getUserById(ctx.db.db, payload.sub);
    if (!user || !user.is_active) {
      res.status(401).json({ error: 'User not found or deactivated' });
      return;
    }

    req.user = toPublicUser(user);
    req.userId = user.id;
    next();
  };
}

/**
 * Middleware: require a specific role (or higher).
 * Role hierarchy: admin > editor > viewer.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Middleware factory: require minimum role level.
 * admin can do everything, editor can read+write, viewer can only read.
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

export function requireMinRole(minRole: UserRole) {
  const minLevel = ROLE_HIERARCHY[minRole];
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userLevel = ROLE_HIERARCHY[req.user.role];
    if (userLevel < minLevel) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
