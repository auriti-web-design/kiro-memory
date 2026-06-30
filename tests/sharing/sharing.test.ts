/**
 * Test suite for read-only sharing via JWT tokens (issue #33).
 *
 * Tests the SharedTokens database operations and JWT utility functions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TotalRecallDatabase } from '../../src/services/sqlite/Database.js';
import {
  createSharedToken,
  listSharedTokens,
  listActiveSharedTokens,
  revokeSharedToken,
  validateSharedToken,
  getSharedTokenById,
} from '../../src/services/sqlite/SharedTokens.js';
import {
  signSharedToken,
  verifySharedToken,
  parseDuration,
} from '../../src/services/sharing/jwt.js';

describe('SharedTokens Database Operations', () => {
  let db: TotalRecallDatabase;

  beforeEach(() => {
    db = new TotalRecallDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should create shared_tokens table via migration', () => {
    const tables = db.db.query(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('shared_tokens');
  });

  it('should create a shared token', () => {
    const expiresAt = new Date(Date.now() + 7 * 86400 * 1000);
    const token = createSharedToken(db.db, 'test-jwt-value', 'myproject', expiresAt, 'Test label');

    expect(token.id).toBeDefined();
    expect(token.token).toBe('test-jwt-value');
    expect(token.project).toBe('myproject');
    expect(token.label).toBe('Test label');
    expect(token.revoked_at).toBeNull();
    expect(token.created_at).toBeDefined();
    expect(token.expires_at).toBe(expiresAt.toISOString());
  });

  it('should create a token scoped to all projects (null project)', () => {
    const expiresAt = new Date(Date.now() + 86400 * 1000);
    const token = createSharedToken(db.db, 'all-projects-token', null, expiresAt);

    expect(token.project).toBeNull();
  });

  it('should list all shared tokens', () => {
    const expiresAt = new Date(Date.now() + 86400 * 1000);
    createSharedToken(db.db, 'token-1', 'project-a', expiresAt);
    createSharedToken(db.db, 'token-2', 'project-b', expiresAt);
    createSharedToken(db.db, 'token-3', null, expiresAt);

    const tokens = listSharedTokens(db.db);
    expect(tokens.length).toBe(3);
  });

  it('should list only active (non-revoked, non-expired) tokens', () => {
    const futureExpiry = new Date(Date.now() + 86400 * 1000);
    const pastExpiry = new Date(Date.now() - 86400 * 1000);

    // Active token
    createSharedToken(db.db, 'active-token', 'project-a', futureExpiry);
    // Expired token
    createSharedToken(db.db, 'expired-token', 'project-b', pastExpiry);
    // Revoked token
    const revokedToken = createSharedToken(db.db, 'revoked-token', null, futureExpiry);
    revokeSharedToken(db.db, revokedToken.id);

    const active = listActiveSharedTokens(db.db);
    expect(active.length).toBe(1);
    expect(active[0]!.token).toBe('active-token');
  });

  it('should revoke a token', () => {
    const expiresAt = new Date(Date.now() + 86400 * 1000);
    const token = createSharedToken(db.db, 'to-revoke', 'project-x', expiresAt);

    const result = revokeSharedToken(db.db, token.id);
    expect(result).toBe(true);

    // Verify it's revoked
    const retrieved = getSharedTokenById(db.db, token.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.revoked_at).not.toBeNull();
  });

  it('should return false when revoking non-existent token', () => {
    const result = revokeSharedToken(db.db, 'non-existent-id');
    expect(result).toBe(false);
  });

  it('should return false when revoking already-revoked token', () => {
    const expiresAt = new Date(Date.now() + 86400 * 1000);
    const token = createSharedToken(db.db, 'double-revoke', null, expiresAt);
    revokeSharedToken(db.db, token.id);

    const secondAttempt = revokeSharedToken(db.db, token.id);
    expect(secondAttempt).toBe(false);
  });

  it('should validate an active token', () => {
    const expiresAt = new Date(Date.now() + 86400 * 1000);
    createSharedToken(db.db, 'valid-token', 'my-project', expiresAt);

    const result = validateSharedToken(db.db, 'valid-token');
    expect(result).not.toBeNull();
    expect(result!.project).toBe('my-project');
  });

  it('should reject a revoked token in validation', () => {
    const expiresAt = new Date(Date.now() + 86400 * 1000);
    const token = createSharedToken(db.db, 'revoked-validate', null, expiresAt);
    revokeSharedToken(db.db, token.id);

    const result = validateSharedToken(db.db, 'revoked-validate');
    expect(result).toBeNull();
  });

  it('should reject an expired token in validation', () => {
    const pastExpiry = new Date(Date.now() - 1000);
    createSharedToken(db.db, 'expired-validate', null, pastExpiry);

    const result = validateSharedToken(db.db, 'expired-validate');
    expect(result).toBeNull();
  });

  it('should reject a non-existent token in validation', () => {
    const result = validateSharedToken(db.db, 'does-not-exist');
    expect(result).toBeNull();
  });

  it('should get a token by ID', () => {
    const expiresAt = new Date(Date.now() + 86400 * 1000);
    const token = createSharedToken(db.db, 'get-by-id', 'proj', expiresAt, 'My Label');

    const retrieved = getSharedTokenById(db.db, token.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.token).toBe('get-by-id');
    expect(retrieved!.label).toBe('My Label');
  });
});

describe('JWT Utilities', () => {
  it('should sign and verify a token', () => {
    const jwt = signSharedToken('test-token-id', 'my-project', 3600);
    expect(jwt).toBeDefined();
    expect(typeof jwt).toBe('string');
    expect(jwt.split('.').length).toBe(3); // JWT has 3 parts

    const payload = verifySharedToken(jwt);
    expect(payload).not.toBeNull();
    expect(payload!.scope).toBe('read');
    expect(payload!.project).toBe('my-project');
    expect(payload!.tokenId).toBe('test-token-id');
  });

  it('should sign a token with null project (all projects)', () => {
    const jwt = signSharedToken('all-projects-id', null, 3600);
    const payload = verifySharedToken(jwt);
    expect(payload).not.toBeNull();
    expect(payload!.project).toBeNull();
  });

  it('should reject an expired token', async () => {
    // Sign with 1 second expiration
    const jwt = signSharedToken('expired-id', null, 1);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));

    const payload = verifySharedToken(jwt);
    expect(payload).toBeNull();
  });

  it('should reject a tampered token', () => {
    const jwt = signSharedToken('tamper-id', 'project', 3600);
    // Tamper with the payload (middle segment)
    const parts = jwt.split('.');
    parts[1] = parts[1]! + 'tampered';
    const tampered = parts.join('.');

    const payload = verifySharedToken(tampered);
    expect(payload).toBeNull();
  });

  it('should reject an invalid token string', () => {
    const payload = verifySharedToken('not-a-jwt');
    expect(payload).toBeNull();
  });
});

describe('parseDuration', () => {
  it('should parse days', () => {
    expect(parseDuration('7d')).toBe(7 * 86400);
    expect(parseDuration('1d')).toBe(86400);
    expect(parseDuration('30d')).toBe(30 * 86400);
  });

  it('should parse hours', () => {
    expect(parseDuration('24h')).toBe(24 * 3600);
    expect(parseDuration('1h')).toBe(3600);
  });

  it('should parse minutes', () => {
    expect(parseDuration('30m')).toBe(30 * 60);
    expect(parseDuration('5m')).toBe(300);
  });

  it('should return null for invalid formats', () => {
    expect(parseDuration('7')).toBeNull();
    expect(parseDuration('d7')).toBeNull();
    expect(parseDuration('7x')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('7s')).toBeNull(); // seconds not supported
  });
});
