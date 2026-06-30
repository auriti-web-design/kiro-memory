/**
 * Users module — Multi-user database operations.
 * Handles user CRUD, session auth tokens, and audit logging.
 */

import type { Database } from '../../db/types.js';
import crypto from 'crypto';

// ── Types ──

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  display_name: string;
  avatar_url: string | null;
  is_active: number;
  created_at: string;
  last_login: string | null;
}

export interface UserPublic {
  id: string;
  email: string;
  role: UserRole;
  display_name: string;
  avatar_url: string | null;
  is_active: number;
  created_at: string;
  last_login: string | null;
}

export interface AuthSession {
  id: string;
  user_id: string;
  token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  user_id: string;
  user_email: string | null;
  action: string;
  target: string | null;
  details: string | null;
  ip_address: string | null;
  timestamp: string;
}

// ── User CRUD ──

export function createUser(
  db: Database,
  email: string,
  passwordHash: string,
  role: UserRole,
  displayName: string
): User {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO users (id, email, password_hash, role, display_name, avatar_url, is_active, created_at, last_login)
     VALUES (?, ?, ?, ?, ?, NULL, 1, ?, NULL)`,
    [id, email, passwordHash, role, displayName, now]
  );

  return {
    id,
    email,
    password_hash: passwordHash,
    role,
    display_name: displayName,
    avatar_url: null,
    is_active: 1,
    created_at: now,
    last_login: null,
  };
}

export function getUserByEmail(db: Database, email: string): User | null {
  const query = db.query('SELECT * FROM users WHERE email = ? AND is_active = 1');
  return query.get(email) as User | null;
}

export function getUserById(db: Database, id: string): User | null {
  const query = db.query('SELECT * FROM users WHERE id = ?');
  return query.get(id) as User | null;
}

export function listUsers(db: Database): UserPublic[] {
  const query = db.query(
    'SELECT id, email, role, display_name, avatar_url, is_active, created_at, last_login FROM users ORDER BY created_at ASC'
  );
  return query.all() as UserPublic[];
}

export function updateUserRole(db: Database, id: string, role: UserRole): boolean {
  const result = db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  return result.changes > 0;
}

export function updateUserLastLogin(db: Database, id: string): void {
  db.run('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), id]);
}

export function deactivateUser(db: Database, id: string): boolean {
  const result = db.run('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
  return result.changes > 0;
}

export function countAdmins(db: Database): number {
  const query = db.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1");
  const row = query.get() as { count: number } | null;
  return row?.count ?? 0;
}

// ── Auth Sessions ──

export function createAuthSession(
  db: Database,
  userId: string,
  token: string,
  refreshToken: string,
  expiresAt: string,
  refreshExpiresAt: string
): AuthSession {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO sessions_auth (id, user_id, token, refresh_token, expires_at, refresh_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, token, refreshToken, expiresAt, refreshExpiresAt, now]
  );

  return { id, user_id: userId, token, refresh_token: refreshToken, expires_at: expiresAt, refresh_expires_at: refreshExpiresAt, created_at: now };
}

export function getSessionByRefreshToken(db: Database, refreshToken: string): AuthSession | null {
  const query = db.query('SELECT * FROM sessions_auth WHERE refresh_token = ?');
  return query.get(refreshToken) as AuthSession | null;
}

export function deleteAuthSession(db: Database, token: string): void {
  db.run('DELETE FROM sessions_auth WHERE token = ?', [token]);
}

export function deleteUserSessions(db: Database, userId: string): void {
  db.run('DELETE FROM sessions_auth WHERE user_id = ?', [userId]);
}

export function cleanExpiredSessions(db: Database): number {
  const now = new Date().toISOString();
  const result = db.run('DELETE FROM sessions_auth WHERE refresh_expires_at < ?', [now]);
  return result.changes;
}

// ── Audit Log ──

export function logAction(
  db: Database,
  userId: string,
  action: string,
  target: string | null = null,
  details: string | null = null,
  ipAddress: string | null = null
): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO audit_log (user_id, action, target, details, ip_address, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, action, target, details, ipAddress, now]
  );
}

export function getAuditLog(
  db: Database,
  limit: number = 100,
  offset: number = 0
): AuditEntry[] {
  const query = db.query(`
    SELECT a.id, a.user_id, u.email as user_email, a.action, a.target, a.details, a.ip_address, a.timestamp
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.timestamp DESC
    LIMIT ? OFFSET ?
  `);
  return query.all(limit, offset) as AuditEntry[];
}

// ── Helpers ──

export function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    is_active: user.is_active,
    created_at: user.created_at,
    last_login: user.last_login,
  };
}

const VALID_ROLES: ReadonlySet<string> = new Set(['admin', 'editor', 'viewer']);

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_ROLES.has(role);
}
