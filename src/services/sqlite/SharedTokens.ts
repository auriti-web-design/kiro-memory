/**
 * SharedTokens - Database operations for read-only sharing via JWT tokens.
 *
 * Manages the shared_tokens table: create, list, revoke, validate.
 */

import type { Database } from '../../db/types.js';
import crypto from 'node:crypto';

export interface SharedToken {
  id: string;
  token: string;
  project: string | null;
  label: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface SharedTokenRow {
  id: string;
  token: string;
  project: string | null;
  label: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

/**
 * Create the shared_tokens table if it doesn't exist.
 * Called from migration v15.
 */
export function createSharedTokensTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS shared_tokens (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      project TEXT,
      label TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_shared_tokens_token ON shared_tokens(token)');
  db.run('CREATE INDEX IF NOT EXISTS idx_shared_tokens_project ON shared_tokens(project)');
}

/**
 * Store a new shared token in the database.
 */
export function createSharedToken(
  db: Database,
  token: string,
  project: string | null,
  expiresAt: Date,
  label: string | null = null
): SharedToken {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAtIso = expiresAt.toISOString();

  db.query(
    `INSERT INTO shared_tokens (id, token, project, label, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`
  ).run(id, token, project, label, now, expiresAtIso);

  return {
    id,
    token,
    project,
    label,
    created_at: now,
    expires_at: expiresAtIso,
    revoked_at: null,
  };
}

/**
 * List all shared tokens (active and revoked).
 * Returns them ordered by creation date descending.
 */
export function listSharedTokens(db: Database): SharedToken[] {
  const rows = db.query(
    'SELECT id, token, project, label, created_at, expires_at, revoked_at FROM shared_tokens ORDER BY created_at DESC'
  ).all() as SharedTokenRow[];

  return rows;
}

/**
 * List only active (non-revoked, non-expired) shared tokens.
 */
export function listActiveSharedTokens(db: Database): SharedToken[] {
  const now = new Date().toISOString();
  const rows = db.query(
    `SELECT id, token, project, label, created_at, expires_at, revoked_at
     FROM shared_tokens
     WHERE revoked_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC`
  ).all(now) as SharedTokenRow[];

  return rows;
}

/**
 * Revoke a shared token by its ID.
 * Returns true if the token was found and revoked, false if not found or already revoked.
 */
export function revokeSharedToken(db: Database, tokenId: string): boolean {
  const now = new Date().toISOString();
  const existing = db.query(
    'SELECT id, revoked_at FROM shared_tokens WHERE id = ?'
  ).get(tokenId) as { id: string; revoked_at: string | null } | null;

  if (!existing) return false;
  if (existing.revoked_at) return false; // Already revoked

  db.query('UPDATE shared_tokens SET revoked_at = ? WHERE id = ?').run(now, tokenId);
  return true;
}

/**
 * Validate a shared token: check it exists, is not revoked, and not expired.
 * Returns the token record if valid, null otherwise.
 */
export function validateSharedToken(db: Database, tokenValue: string): SharedToken | null {
  const row = db.query(
    `SELECT id, token, project, label, created_at, expires_at, revoked_at
     FROM shared_tokens
     WHERE token = ?`
  ).get(tokenValue) as SharedTokenRow | null;

  if (!row) return null;

  // Check revocation
  if (row.revoked_at) return null;

  // Check expiration
  const now = new Date();
  const expiresAt = new Date(row.expires_at);
  if (now >= expiresAt) return null;

  return row;
}

/**
 * Get a shared token by ID (for display purposes, includes revoked/expired).
 */
export function getSharedTokenById(db: Database, tokenId: string): SharedToken | null {
  const row = db.query(
    `SELECT id, token, project, label, created_at, expires_at, revoked_at
     FROM shared_tokens
     WHERE id = ?`
  ).get(tokenId) as SharedTokenRow | null;

  return row;
}
