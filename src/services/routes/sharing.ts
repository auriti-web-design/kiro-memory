/**
 * Router Sharing: read-only JWT-based sharing endpoints.
 *
 * Endpoints:
 *   GET  /shared                    — HTML viewer for shared data (token in query param)
 *   GET  /api/shared/observations   — Observations for shared scope (token required)
 *   GET  /api/shared/search         — Search within shared scope (token required)
 *   POST /api/sharing/tokens        — Create a new shared token (requires worker auth)
 *   GET  /api/sharing/tokens        — List all shared tokens (requires worker auth)
 *   DELETE /api/sharing/tokens/:id  — Revoke a shared token (requires worker auth)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { parseIntSafe } from '../worker-context.js';
import { verifySharedToken, signSharedToken, parseDuration } from '../sharing/jwt.js';
import type { SharedTokenPayload } from '../sharing/jwt.js';
import {
  createSharedToken,
  listSharedTokens,
  listActiveSharedTokens,
  revokeSharedToken,
  validateSharedToken,
} from '../sqlite/SharedTokens.js';
import { searchObservationsFTS } from '../sqlite/Search.js';
import { logger } from '../../utils/logger.js';

// Default expiration: 7 days
const DEFAULT_EXPIRATION_SECONDS = 7 * 86400;

/**
 * Middleware: extract and validate the JWT shared token from query param or Authorization header.
 * Attaches the decoded payload to req as `sharedScope`.
 */
function sharedTokenAuth(ctx: WorkerContext) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Token from query param (shareable URL) or Authorization header
    const token = (req.query['token'] as string | undefined)
      || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'Missing shared token' });
      return;
    }

    // Step 1: Verify JWT signature and expiration
    const payload = verifySharedToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Step 2: Check token is not revoked in the database
    const dbToken = validateSharedToken(ctx.db.db, token);
    if (!dbToken) {
      res.status(401).json({ error: 'Token has been revoked or is no longer valid' });
      return;
    }

    // Attach scope to request for downstream handlers
    (req as any).sharedScope = payload;
    next();
  };
}

export function createSharingRouter(ctx: WorkerContext, workerToken: string): Router {
  const router = Router();

  // ── Public shared endpoints (JWT token auth) ──

  /**
   * GET /shared — Serves a minimal read-only HTML viewer.
   * The token is in the query string for easy link sharing.
   */
  router.get('/shared', sharedTokenAuth(ctx), (req: Request, res: Response) => {
    const scope = (req as any).sharedScope as SharedTokenPayload;
    const projectLabel = scope.project || 'All Projects';

    // Serve a minimal HTML page that shows shared observations
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Total Recall — Shared View</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    .header { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #334155; }
    .header h1 { font-size: 1.5rem; color: #60a5fa; }
    .header p { color: #94a3b8; margin-top: 0.25rem; }
    .badge { display: inline-block; background: #1e3a5f; color: #93c5fd; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
    .obs-list { list-style: none; }
    .obs-item { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
    .obs-title { font-weight: 600; color: #f1f5f9; }
    .obs-meta { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
    .obs-text { font-size: 0.875rem; color: #cbd5e1; margin-top: 0.5rem; white-space: pre-wrap; }
    .search-box { width: 100%; padding: 0.5rem 1rem; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #e2e8f0; font-size: 0.875rem; margin-bottom: 1rem; }
    .search-box:focus { outline: none; border-color: #60a5fa; }
    .empty { text-align: center; color: #64748b; padding: 2rem; }
    #loading { text-align: center; color: #64748b; padding: 2rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧠 Total Recall — Shared View</h1>
    <p>Project: <span class="badge">${escapeHtml(projectLabel)}</span> · Read-only access</p>
  </div>
  <input class="search-box" type="text" id="searchInput" placeholder="Search observations..." />
  <div id="loading">Loading observations...</div>
  <ul class="obs-list" id="obsList"></ul>
  <script>
    const token = new URLSearchParams(window.location.search).get('token');
    const baseUrl = window.location.origin;

    async function fetchObservations(query) {
      const url = query
        ? baseUrl + '/api/shared/search?q=' + encodeURIComponent(query) + '&token=' + encodeURIComponent(token)
        : baseUrl + '/api/shared/observations?token=' + encodeURIComponent(token);
      const resp = await fetch(url);
      if (!resp.ok) { document.getElementById('loading').textContent = 'Access denied or token expired.'; return []; }
      const data = await resp.json();
      return data.observations || [];
    }

    function renderList(observations) {
      const list = document.getElementById('obsList');
      const loading = document.getElementById('loading');
      loading.style.display = 'none';
      if (observations.length === 0) { list.innerHTML = '<li class="empty">No observations found.</li>'; return; }
      list.innerHTML = observations.map(o => {
        const date = new Date(o.created_at).toLocaleString();
        const text = o.text ? '<div class="obs-text">' + escapeHtml(o.text).substring(0, 500) + '</div>' : '';
        return '<li class="obs-item"><div class="obs-title">' + escapeHtml(o.title) + '</div><div class="obs-meta">' + escapeHtml(o.type) + ' · ' + date + (o.project ? ' · ' + escapeHtml(o.project) : '') + '</div>' + text + '</li>';
      }).join('');
    }

    function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

    let debounceTimer;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchObservations(e.target.value).then(renderList), 300);
    });

    fetchObservations('').then(renderList);
  </script>
</body>
</html>`;

    res.type('html').send(html);
  });

  /**
   * GET /api/shared/observations — Returns observations scoped to the token's project.
   */
  router.get('/api/shared/observations', sharedTokenAuth(ctx), (req: Request, res: Response) => {
    const scope = (req as any).sharedScope as SharedTokenPayload;
    const limit = parseIntSafe(req.query['limit'] as string | undefined, 50, 1, 200);
    const offset = parseIntSafe(req.query['offset'] as string | undefined, 0, 0, 100000);

    try {
      let query = 'SELECT id, project, type, title, subtitle, text, concepts, created_at FROM observations';
      const params: any[] = [];

      if (scope.project) {
        query += ' WHERE project = ?';
        params.push(scope.project);
      }

      query += ' ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const observations = ctx.db.query(query).all(...params);
      res.json({ observations, count: (observations as any[]).length });
    } catch (error) {
      logger.error('SHARING', 'Failed to fetch shared observations', {}, error as Error);
      res.status(500).json({ error: 'Failed to fetch observations' });
    }
  });

  /**
   * GET /api/shared/search — FTS5 search within the token's scoped project.
   */
  router.get('/api/shared/search', sharedTokenAuth(ctx), (req: Request, res: Response) => {
    const scope = (req as any).sharedScope as SharedTokenPayload;
    const q = req.query['q'] as string | undefined;

    if (!q) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    try {
      const filters = {
        project: scope.project || undefined,
        limit: parseIntSafe(req.query['limit'] as string | undefined, 20, 1, 100),
      };

      const observations = searchObservationsFTS(ctx.db.db, q, filters);
      res.json({ observations, count: observations.length });
    } catch (error) {
      logger.error('SHARING', 'Shared search failed', { query: q }, error as Error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // ── Admin endpoints (worker token auth) ──

  /**
   * POST /api/sharing/tokens — Create a new shared token.
   * Body: { project?: string, expires?: string, label?: string }
   */
  router.post('/api/sharing/tokens', (req: Request, res: Response) => {
    const authToken = req.headers['x-worker-token'] as string;
    if (authToken !== workerToken) {
      res.status(401).json({ error: 'Invalid or missing X-Worker-Token' });
      return;
    }

    const { project, expires, label } = req.body || {};

    // Parse expiration
    let expirationSeconds = DEFAULT_EXPIRATION_SECONDS;
    if (expires) {
      const parsed = parseDuration(expires);
      if (parsed === null) {
        res.status(400).json({ error: 'Invalid expires format. Use: 7d, 24h, 30m' });
        return;
      }
      expirationSeconds = parsed;
    }

    const expiresAt = new Date(Date.now() + expirationSeconds * 1000);

    try {
      // Create a placeholder token record first to get the ID
      const placeholderToken = 'pending';
      const record = createSharedToken(
        ctx.db.db,
        placeholderToken,
        project || null,
        expiresAt,
        label || null
      );

      // Now sign the JWT with the token ID
      const jwtToken = signSharedToken(record.id, project || null, expirationSeconds);

      // Update the record with the actual JWT
      ctx.db.query('UPDATE shared_tokens SET token = ? WHERE id = ?').run(jwtToken, record.id);

      const host = req.headers.host || `127.0.0.1:3001`;
      const shareUrl = `http://${host}/shared?token=${encodeURIComponent(jwtToken)}`;

      res.status(201).json({
        id: record.id,
        token: jwtToken,
        project: project || null,
        label: label || null,
        expires_at: expiresAt.toISOString(),
        url: shareUrl,
      });
    } catch (error) {
      logger.error('SHARING', 'Failed to create shared token', {}, error as Error);
      res.status(500).json({ error: 'Failed to create shared token' });
    }
  });

  /**
   * GET /api/sharing/tokens — List all shared tokens.
   */
  router.get('/api/sharing/tokens', (req: Request, res: Response) => {
    const authToken = req.headers['x-worker-token'] as string;
    if (authToken !== workerToken) {
      res.status(401).json({ error: 'Invalid or missing X-Worker-Token' });
      return;
    }

    try {
      const activeOnly = req.query['active'] === 'true';
      const tokens = activeOnly
        ? listActiveSharedTokens(ctx.db.db)
        : listSharedTokens(ctx.db.db);

      // Don't expose the full JWT in the list view — just the first/last 8 chars
      const masked = tokens.map(t => ({
        ...t,
        token: t.token.length > 16
          ? t.token.slice(0, 8) + '...' + t.token.slice(-8)
          : '***',
        is_expired: new Date(t.expires_at) <= new Date(),
        is_revoked: !!t.revoked_at,
      }));

      res.json({ tokens: masked, count: masked.length });
    } catch (error) {
      logger.error('SHARING', 'Failed to list shared tokens', {}, error as Error);
      res.status(500).json({ error: 'Failed to list tokens' });
    }
  });

  /**
   * DELETE /api/sharing/tokens/:id — Revoke a shared token.
   */
  router.delete('/api/sharing/tokens/:id', (req: Request, res: Response) => {
    const authToken = req.headers['x-worker-token'] as string;
    if (authToken !== workerToken) {
      res.status(401).json({ error: 'Invalid or missing X-Worker-Token' });
      return;
    }

    const tokenId = req.params['id'] as string;
    if (!tokenId) {
      res.status(400).json({ error: 'Token ID is required' });
      return;
    }

    try {
      const revoked = revokeSharedToken(ctx.db.db, tokenId);
      if (!revoked) {
        res.status(404).json({ error: 'Token not found or already revoked' });
        return;
      }

      res.json({ ok: true, message: 'Token revoked successfully' });
    } catch (error) {
      logger.error('SHARING', 'Failed to revoke shared token', { tokenId }, error as Error);
      res.status(500).json({ error: 'Failed to revoke token' });
    }
  });

  return router;
}

/** Escape HTML special characters for safe embedding in the viewer template */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
