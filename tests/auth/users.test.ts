/**
 * Test suite for multi-user authentication and authorization.
 * Tests: user creation, login, role-based access, audit log, single-user bypass.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TotalRecallDatabase } from '../../src/services/sqlite/Database.js';
import {
  createUser,
  getUserByEmail,
  getUserById,
  listUsers,
  updateUserRole,
  deactivateUser,
  countAdmins,
  createAuthSession,
  getSessionByRefreshToken,
  deleteAuthSession,
  deleteUserSessions,
  cleanExpiredSessions,
  logAction,
  getAuditLog,
  isValidRole,
  toPublicUser,
} from '../../src/services/sqlite/Users.js';
import {
  signJwt,
  verifyJwt,
  isAuthEnabled,
} from '../../src/services/middleware/auth-middleware.js';

describe('Multi-user: Users CRUD', () => {
  let db: TotalRecallDatabase;

  beforeEach(() => {
    db = new TotalRecallDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates a user with all fields', () => {
    const user = createUser(db.db, 'test@example.com', 'hash123', 'admin', 'Test User');

    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.password_hash).toBe('hash123');
    expect(user.role).toBe('admin');
    expect(user.display_name).toBe('Test User');
    expect(user.is_active).toBe(1);
    expect(user.avatar_url).toBeNull();
    expect(user.last_login).toBeNull();
    expect(user.created_at).toBeDefined();
  });

  it('getUserByEmail finds active user', () => {
    createUser(db.db, 'findme@test.com', 'hash', 'viewer', 'Find Me');
    const found = getUserByEmail(db.db, 'findme@test.com');

    expect(found).not.toBeNull();
    expect(found!.email).toBe('findme@test.com');
  });

  it('getUserByEmail returns null for non-existent user', () => {
    const found = getUserByEmail(db.db, 'nonexistent@test.com');
    expect(found).toBeNull();
  });

  it('getUserByEmail returns null for deactivated user', () => {
    const user = createUser(db.db, 'deactivated@test.com', 'hash', 'viewer', 'Deactivated');
    deactivateUser(db.db, user.id);

    const found = getUserByEmail(db.db, 'deactivated@test.com');
    expect(found).toBeNull();
  });

  it('getUserById retrieves user by UUID', () => {
    const user = createUser(db.db, 'byid@test.com', 'hash', 'editor', 'By ID');
    const found = getUserById(db.db, user.id);

    expect(found).not.toBeNull();
    expect(found!.email).toBe('byid@test.com');
  });

  it('listUsers returns all users', () => {
    createUser(db.db, 'a@test.com', 'h1', 'admin', 'A');
    createUser(db.db, 'b@test.com', 'h2', 'editor', 'B');
    createUser(db.db, 'c@test.com', 'h3', 'viewer', 'C');

    const users = listUsers(db.db);
    expect(users.length).toBe(3);
    // Verify password_hash is NOT in public listing
    expect((users[0] as any).password_hash).toBeUndefined();
  });

  it('updateUserRole changes role', () => {
    const user = createUser(db.db, 'rolechange@test.com', 'hash', 'viewer', 'Upgrade');
    const updated = updateUserRole(db.db, user.id, 'editor');

    expect(updated).toBe(true);
    const found = getUserById(db.db, user.id);
    expect(found!.role).toBe('editor');
  });

  it('deactivateUser sets is_active to 0', () => {
    const user = createUser(db.db, 'goodbye@test.com', 'hash', 'viewer', 'Bye');
    const result = deactivateUser(db.db, user.id);

    expect(result).toBe(true);
    const found = getUserById(db.db, user.id);
    expect(found!.is_active).toBe(0);
  });

  it('countAdmins counts active admins only', () => {
    createUser(db.db, 'admin1@test.com', 'h1', 'admin', 'Admin 1');
    createUser(db.db, 'admin2@test.com', 'h2', 'admin', 'Admin 2');
    const user3 = createUser(db.db, 'admin3@test.com', 'h3', 'admin', 'Admin 3');
    createUser(db.db, 'editor@test.com', 'h4', 'editor', 'Editor');

    expect(countAdmins(db.db)).toBe(3);

    deactivateUser(db.db, user3.id);
    expect(countAdmins(db.db)).toBe(2);
  });

  it('enforces unique email constraint', () => {
    createUser(db.db, 'unique@test.com', 'h1', 'viewer', 'First');

    expect(() => {
      createUser(db.db, 'unique@test.com', 'h2', 'editor', 'Duplicate');
    }).toThrow();
  });

  it('toPublicUser strips password_hash', () => {
    const user = createUser(db.db, 'public@test.com', 'secret_hash', 'viewer', 'Public');
    const pub = toPublicUser(user);

    expect(pub.email).toBe('public@test.com');
    expect((pub as any).password_hash).toBeUndefined();
  });

  it('isValidRole validates correctly', () => {
    expect(isValidRole('admin')).toBe(true);
    expect(isValidRole('editor')).toBe(true);
    expect(isValidRole('viewer')).toBe(true);
    expect(isValidRole('superadmin')).toBe(false);
    expect(isValidRole('')).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
  });
});

describe('Multi-user: Auth Sessions', () => {
  let db: TotalRecallDatabase;

  beforeEach(() => {
    db = new TotalRecallDatabase(':memory:');
    createUser(db.db, 'session@test.com', 'hash', 'admin', 'Session User');
  });

  afterEach(() => {
    db.close();
  });

  it('creates and retrieves auth session by refresh token', () => {
    const user = getUserByEmail(db.db, 'session@test.com')!;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600_000).toISOString();
    const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();

    createAuthSession(db.db, user.id, 'access_123', 'refresh_456', expiresAt, refreshExpiresAt);

    const session = getSessionByRefreshToken(db.db, 'refresh_456');
    expect(session).not.toBeNull();
    expect(session!.user_id).toBe(user.id);
    expect(session!.token).toBe('access_123');
  });

  it('deleteAuthSession removes session by token', () => {
    const user = getUserByEmail(db.db, 'session@test.com')!;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600_000).toISOString();
    const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();

    createAuthSession(db.db, user.id, 'to_delete', 'refresh_delete', expiresAt, refreshExpiresAt);
    deleteAuthSession(db.db, 'to_delete');

    const session = getSessionByRefreshToken(db.db, 'refresh_delete');
    expect(session).toBeNull();
  });

  it('deleteUserSessions removes all sessions for a user', () => {
    const user = getUserByEmail(db.db, 'session@test.com')!;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600_000).toISOString();
    const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();

    createAuthSession(db.db, user.id, 'tok1', 'ref1', expiresAt, refreshExpiresAt);
    createAuthSession(db.db, user.id, 'tok2', 'ref2', expiresAt, refreshExpiresAt);

    deleteUserSessions(db.db, user.id);

    expect(getSessionByRefreshToken(db.db, 'ref1')).toBeNull();
    expect(getSessionByRefreshToken(db.db, 'ref2')).toBeNull();
  });

  it('cleanExpiredSessions removes only expired sessions', () => {
    const user = getUserByEmail(db.db, 'session@test.com')!;
    const past = new Date(Date.now() - 100_000).toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();

    createAuthSession(db.db, user.id, 'expired', 'ref_expired', past, past);
    createAuthSession(db.db, user.id, 'valid', 'ref_valid', future, future);

    const cleaned = cleanExpiredSessions(db.db);
    expect(cleaned).toBe(1);

    expect(getSessionByRefreshToken(db.db, 'ref_expired')).toBeNull();
    expect(getSessionByRefreshToken(db.db, 'ref_valid')).not.toBeNull();
  });
});

describe('Multi-user: JWT', () => {
  const secret = 'test-secret-key-at-least-32-chars-long!!';

  it('signs and verifies a valid token', () => {
    const token = signJwt(
      { sub: 'user-123', email: 'test@test.com', role: 'admin' },
      secret,
      3600
    );

    expect(token).toContain('.');
    const parts = token.split('.');
    expect(parts.length).toBe(3);

    const payload = verifyJwt(token, secret);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-123');
    expect(payload!.email).toBe('test@test.com');
    expect(payload!.role).toBe('admin');
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects token with wrong secret', () => {
    const token = signJwt(
      { sub: 'user-123', email: 'test@test.com', role: 'admin' },
      secret,
      3600
    );

    const payload = verifyJwt(token, 'wrong-secret-that-is-also-32-chars!!');
    expect(payload).toBeNull();
  });

  it('rejects expired token', () => {
    const token = signJwt(
      { sub: 'user-123', email: 'test@test.com', role: 'admin' },
      secret,
      -10 // expired 10 seconds ago
    );

    const payload = verifyJwt(token, secret);
    expect(payload).toBeNull();
  });

  it('rejects malformed token', () => {
    expect(verifyJwt('not.a.valid-token', secret)).toBeNull();
    expect(verifyJwt('', secret)).toBeNull();
    expect(verifyJwt('single-part', secret)).toBeNull();
  });
});

describe('Multi-user: Audit Log', () => {
  let db: TotalRecallDatabase;

  beforeEach(() => {
    db = new TotalRecallDatabase(':memory:');
    createUser(db.db, 'auditor@test.com', 'hash', 'admin', 'Auditor');
  });

  afterEach(() => {
    db.close();
  });

  it('logs actions with all fields', () => {
    const user = getUserByEmail(db.db, 'auditor@test.com')!;
    logAction(db.db, user.id, 'users.create', 'new@test.com', '{"role":"viewer"}', '127.0.0.1');

    const entries = getAuditLog(db.db);
    expect(entries.length).toBe(1);
    expect(entries[0]!.user_id).toBe(user.id);
    expect(entries[0]!.user_email).toBe('auditor@test.com');
    expect(entries[0]!.action).toBe('users.create');
    expect(entries[0]!.target).toBe('new@test.com');
    expect(entries[0]!.details).toBe('{"role":"viewer"}');
    expect(entries[0]!.ip_address).toBe('127.0.0.1');
    expect(entries[0]!.timestamp).toBeDefined();
  });

  it('getAuditLog respects limit and offset', () => {
    const user = getUserByEmail(db.db, 'auditor@test.com')!;

    for (let i = 0; i < 10; i++) {
      logAction(db.db, user.id, `action_${i}`, null, null, null);
    }

    const page1 = getAuditLog(db.db, 3, 0);
    expect(page1.length).toBe(3);

    const page2 = getAuditLog(db.db, 3, 3);
    expect(page2.length).toBe(3);

    // All entries created at same timestamp — order is DESC by rowid (autoincrement)
    // page1 gets the 3 most recent (action_9, 8, 7) but since timestamp is identical
    // SQLite uses insertion order which may vary. Just verify pagination works.
    const allActions = getAuditLog(db.db, 100, 0);
    expect(allActions.length).toBe(10);

    // Ensure page1 and page2 don't overlap
    const page1Ids = page1.map(e => e.id);
    const page2Ids = page2.map(e => e.id);
    const overlap = page1Ids.filter(id => page2Ids.includes(id));
    expect(overlap.length).toBe(0);
  });

  it('audit log handles null target and details', () => {
    const user = getUserByEmail(db.db, 'auditor@test.com')!;
    logAction(db.db, user.id, 'login', null, null, null);

    const entries = getAuditLog(db.db);
    expect(entries[0]!.target).toBeNull();
    expect(entries[0]!.details).toBeNull();
  });
});

describe('Multi-user: Single-user mode', () => {
  it('isAuthEnabled returns false when not configured', () => {
    // By default, auth.enabled is false
    expect(isAuthEnabled()).toBe(false);
  });
});

describe('Multi-user: Migration integrity', () => {
  let db: TotalRecallDatabase;

  beforeEach(() => {
    db = new TotalRecallDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates users table with correct schema', () => {
    const tables = db.db.query(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('sessions_auth');
    expect(tableNames).toContain('audit_log');
  });

  it('creates all expected indexes', () => {
    const indexes = db.db.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_users%' OR name LIKE 'idx_sessions_auth%' OR name LIKE 'idx_audit_log%'"
    ).all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain('idx_users_email');
    expect(indexNames).toContain('idx_users_role');
    expect(indexNames).toContain('idx_sessions_auth_user');
    expect(indexNames).toContain('idx_sessions_auth_token');
    expect(indexNames).toContain('idx_sessions_auth_refresh');
    expect(indexNames).toContain('idx_audit_log_user');
    expect(indexNames).toContain('idx_audit_log_timestamp');
    expect(indexNames).toContain('idx_audit_log_action');
  });
});
