/**
 * JWT utilities for read-only sharing tokens.
 *
 * Secret lifecycle:
 * - Generated on first use (crypto.randomBytes)
 * - Stored at ~/.totalrecall/jwt.secret
 * - Loaded once per process lifetime
 */

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, ensureDir } from '../../shared/paths.js';
import { logger } from '../../utils/logger.js';

const JWT_SECRET_FILE = join(DATA_DIR, 'jwt.secret');

export interface SharedTokenPayload {
  /** Always 'read' for shared tokens */
  scope: 'read';
  /** Project name, or null for all-projects access */
  project: string | null;
  /** Token ID in the shared_tokens table (for revocation checks) */
  tokenId: string;
}

let _cachedSecret: string | null = null;

/**
 * Get or create the JWT signing secret.
 * Generated once, stored at ~/.totalrecall/jwt.secret with 0600 permissions.
 */
export function getJwtSecret(): string {
  if (_cachedSecret) return _cachedSecret;

  ensureDir(DATA_DIR);

  if (existsSync(JWT_SECRET_FILE)) {
    _cachedSecret = readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
    return _cachedSecret;
  }

  // Generate a new 64-byte hex secret
  const secret = crypto.randomBytes(64).toString('hex');
  writeFileSync(JWT_SECRET_FILE, secret, 'utf-8');
  try {
    chmodSync(JWT_SECRET_FILE, 0o600);
  } catch (err) {
    if (process.platform !== 'win32') {
      logger.warn('JWT', `chmod 600 failed on ${JWT_SECRET_FILE}`, {}, err as Error);
    }
  }

  _cachedSecret = secret;
  return _cachedSecret;
}

/**
 * Sign a shared token JWT with the configured expiration.
 */
export function signSharedToken(
  tokenId: string,
  project: string | null,
  expiresInSeconds: number
): string {
  const secret = getJwtSecret();
  const payload: SharedTokenPayload = {
    scope: 'read',
    project,
    tokenId,
  };

  return jwt.sign(payload, secret, {
    expiresIn: expiresInSeconds,
    algorithm: 'HS256',
    issuer: 'totalrecall',
    subject: 'shared-access',
  });
}

/**
 * Verify and decode a shared token JWT.
 * Returns the payload if valid, null if expired/invalid signature.
 */
export function verifySharedToken(token: string): SharedTokenPayload | null {
  const secret = getJwtSecret();

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'totalrecall',
      subject: 'shared-access',
    }) as SharedTokenPayload & jwt.JwtPayload;

    // Ensure required fields are present
    if (decoded.scope !== 'read' || !decoded.tokenId) {
      return null;
    }

    return {
      scope: decoded.scope,
      project: decoded.project ?? null,
      tokenId: decoded.tokenId,
    };
  } catch {
    // Expired, invalid signature, malformed
    return null;
  }
}

/**
 * Parse a duration string (e.g., "7d", "24h", "30m") into seconds.
 * Supported units: d (days), h (hours), m (minutes).
 * Returns null if the format is invalid.
 */
export function parseDuration(duration: string): number | null {
  const match = duration.match(/^(\d+)(d|h|m)$/);
  if (!match) return null;

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  switch (unit) {
    case 'd': return value * 86400;
    case 'h': return value * 3600;
    case 'm': return value * 60;
    default: return null;
  }
}
