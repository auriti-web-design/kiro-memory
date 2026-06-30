/**
 * Router Users: user management and audit log (admin only).
 * All endpoints require authentication + admin role.
 */

import { Router } from 'express';
import crypto from 'crypto';
import type { WorkerContext } from '../worker-context.js';
import type { AuthenticatedRequest } from '../middleware/auth-middleware.js';
import { requireAuth, requireRole } from '../middleware/auth-middleware.js';
import {
  createUser,
  getUserById,
  getUserByEmail,
  listUsers,
  updateUserRole,
  deactivateUser,
  logAction,
  getAuditLog,
  countAdmins,
  isValidRole,
  deleteUserSessions,
} from '../sqlite/Users.js';
import type { UserRole } from '../sqlite/Users.js';
import { parseIntSafe } from '../worker-context.js';
import { logger } from '../../utils/logger.js';

/**
 * Hash password using bcryptjs. Falls back to SHA-256 if bcryptjs unavailable.
 */
async function hashPassword(password: string): Promise<string> {
  try {
    const bcrypt = await import('bcryptjs');
    return bcrypt.hashSync(password, 10);
  } catch {
    // Fallback: SHA-256 (less secure, but functional without bcryptjs)
    return crypto.createHash('sha256').update(password).digest('hex');
  }
}

/**
 * Generate a secure random password.
 */
function generatePassword(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/** Extract client IP safely from Express request (handles string | string[] | undefined). */
function getClientIp(req: AuthenticatedRequest): string | null {
  const ip = req.ip;
  if (Array.isArray(ip)) return ip[0] ?? null;
  return ip ?? null;
}

export function createUsersRouter(ctx: WorkerContext): Router {
  const router = Router();

  // All routes require auth + admin
  const auth = requireAuth(ctx);
  const adminOnly = requireRole('admin');

  /**
   * GET /api/users — List all users (admin only)
   */
  router.get('/api/users', auth, adminOnly, (req: AuthenticatedRequest, res) => {
    const users = listUsers(ctx.db.db);
    const ip = getClientIp(req);
    logAction(ctx.db.db, req.userId!, 'users.list', null, null, ip);
    res.json({ users });
  });

  /**
   * POST /api/users — Create/invite a user (admin only)
   * Body: { email, role, display_name?, password? }
   * If password is not provided, one is generated.
   */
  router.post('/api/users', auth, adminOnly, async (req: AuthenticatedRequest, res) => {
    const { email, role, display_name, password } = req.body || {};

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }

    // Validate role
    if (!isValidRole(role)) {
      res.status(400).json({ error: 'Role must be admin, editor, or viewer' });
      return;
    }

    // Check duplicate
    const normalizedEmail = email.toLowerCase().trim();
    const existing = getUserByEmail(ctx.db.db, normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'User with this email already exists' });
      return;
    }

    // Hash password
    const plainPassword = password && typeof password === 'string' ? password : generatePassword();
    const passwordHash = await hashPassword(plainPassword);

    // Create user
    const displayName = display_name && typeof display_name === 'string'
      ? display_name
      : normalizedEmail.split('@')[0] ?? normalizedEmail;

    const user = createUser(ctx.db.db, normalizedEmail, passwordHash, role as UserRole, displayName);

    logAction(
      ctx.db.db,
      req.userId!,
      'users.create',
      user.email,
      JSON.stringify({ role, display_name: displayName }),
      getClientIp(req)
    );

    logger.info('AUTH', `User created: ${user.email} (${role})`, { by: req.user?.email });

    // Return user info + generated password (only shown once)
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        display_name: user.display_name,
        created_at: user.created_at,
      },
      generated_password: password ? undefined : plainPassword,
    });
  });

  /**
   * PUT /api/users/:id/role — Change user role (admin only)
   * Body: { role }
   */
  router.put('/api/users/:id/role', auth, adminOnly, (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string | undefined;
    const { role } = req.body || {};

    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    if (!isValidRole(role)) {
      res.status(400).json({ error: 'Role must be admin, editor, or viewer' });
      return;
    }

    // Prevent removing last admin
    const targetUser = getUserById(ctx.db.db, id);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.role === 'admin' && role !== 'admin') {
      const adminCount = countAdmins(ctx.db.db);
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot remove the last admin' });
        return;
      }
    }

    const updated = updateUserRole(ctx.db.db, id, role as UserRole);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logAction(
      ctx.db.db,
      req.userId!,
      'users.role_change',
      targetUser.email,
      JSON.stringify({ from: targetUser.role, to: role }),
      getClientIp(req)
    );

    res.json({ ok: true, user_id: id, new_role: role });
  });

  /**
   * DELETE /api/users/:id — Deactivate user (admin only)
   */
  router.delete('/api/users/:id', auth, adminOnly, (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string | undefined;

    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    // Prevent self-deactivation
    if (id === req.userId) {
      res.status(400).json({ error: 'Cannot deactivate yourself' });
      return;
    }

    const targetUser = getUserById(ctx.db.db, id);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Prevent removing last admin
    if (targetUser.role === 'admin') {
      const adminCount = countAdmins(ctx.db.db);
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot deactivate the last admin' });
        return;
      }
    }

    deactivateUser(ctx.db.db, id);
    deleteUserSessions(ctx.db.db, id);

    logAction(
      ctx.db.db,
      req.userId!,
      'users.deactivate',
      targetUser.email,
      null,
      getClientIp(req)
    );

    res.json({ ok: true });
  });

  /**
   * GET /api/audit — Audit log (admin only)
   * Query: ?limit=100&offset=0
   */
  router.get('/api/audit', auth, adminOnly, (req: AuthenticatedRequest, res) => {
    const limit = parseIntSafe(req.query.limit as string | undefined, 100, 1, 1000);
    const offset = parseIntSafe(req.query.offset as string | undefined, 0, 0, 100000);

    const entries = getAuditLog(ctx.db.db, limit, offset);
    res.json({ entries, limit, offset });
  });

  return router;
}
