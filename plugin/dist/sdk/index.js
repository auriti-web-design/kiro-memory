import { createRequire } from 'module';const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/shims/bun-sqlite.ts
import BetterSqlite3 from "better-sqlite3";
var Database, BunQueryCompat;
var init_bun_sqlite = __esm({
  "src/shims/bun-sqlite.ts"() {
    Database = class {
      _db;
      _stmtCache = /* @__PURE__ */ new Map();
      constructor(path, options) {
        this._db = new BetterSqlite3(path, {
          // better-sqlite3 creates the file by default ('create' not needed)
          readonly: options?.readwrite === false ? true : false
        });
      }
      /**
       * Execute a SQL query without results.
       * PRAGMA statements are handled via better-sqlite3's native pragma() method.
       */
      run(sql, params) {
        const trimmed = sql.trim();
        if (/^PRAGMA\s+/i.test(trimmed)) {
          const pragmaBody = trimmed.replace(/^PRAGMA\s+/i, "").replace(/;$/, "");
          this._db.pragma(pragmaBody);
          return { lastInsertRowid: 0, changes: 0 };
        }
        const stmt = this._db.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return result;
      }
      /**
       * Prepare a query with bun:sqlite-compatible interface.
       * Returns a cached prepared statement for repeated queries.
       */
      query(sql) {
        let cached = this._stmtCache.get(sql);
        if (!cached) {
          cached = new BunQueryCompat(this._db, sql);
          this._stmtCache.set(sql, cached);
        }
        return cached;
      }
      /**
       * Create a transaction
       */
      transaction(fn) {
        return this._db.transaction(fn);
      }
      /**
       * Close the connection
       */
      close() {
        this._stmtCache.clear();
        this._db.close();
      }
    };
    BunQueryCompat = class {
      _stmt;
      constructor(db, sql) {
        this._stmt = db.prepare(sql);
      }
      /**
       * Adatta parametri named da formato bun:sqlite a better-sqlite3.
       * bun:sqlite: chiavi CON prefisso (es. { $todayStart: 123 })
       * better-sqlite3: chiavi SENZA prefisso (es. { todayStart: 123 })
       */
      _adaptParams(params) {
        if (params.length !== 1 || typeof params[0] !== "object" || params[0] === null || Array.isArray(params[0])) {
          return params;
        }
        const obj = params[0];
        const keys = Object.keys(obj);
        if (keys.length === 0) return params;
        if (!keys[0].startsWith("$") && !keys[0].startsWith("@") && !keys[0].startsWith(":")) {
          return params;
        }
        const adapted = {};
        for (const key of keys) {
          adapted[key.slice(1)] = obj[key];
        }
        return [adapted];
      }
      /**
       * Returns all rows
       */
      all(...params) {
        if (params.length === 0) return this._stmt.all();
        return this._stmt.all(...this._adaptParams(params));
      }
      /**
       * Returns the first row or null
       */
      get(...params) {
        if (params.length === 0) return this._stmt.get();
        return this._stmt.get(...this._adaptParams(params));
      }
      /**
       * Execute without results
       */
      run(...params) {
        if (params.length === 0) return this._stmt.run();
        return this._stmt.run(...this._adaptParams(params));
      }
    };
  }
});

// src/db/bun-sqlite-adapter.ts
var bun_sqlite_adapter_exports = {};
__export(bun_sqlite_adapter_exports, {
  Database: () => Database2
});
var Database2;
var init_bun_sqlite_adapter = __esm({
  "src/db/bun-sqlite-adapter.ts"() {
    "use strict";
    init_bun_sqlite();
    Database2 = class {
      _db;
      constructor(path, _options) {
        this._db = new Database(path, { create: true, readwrite: true });
      }
      /**
       * Execute a SQL query without results.
       */
      run(sql, params) {
        const stmt = this._db.query(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return {
          lastInsertRowid: result?.lastInsertRowid ?? 0,
          changes: result?.changes ?? 0
        };
      }
      /**
       * Prepare a query and return a statement wrapper.
       */
      query(sql) {
        const stmt = this._db.query(sql);
        return {
          all(...params) {
            if (params.length === 0) return stmt.all();
            return stmt.all(...params);
          },
          get(...params) {
            if (params.length === 0) return stmt.get();
            return stmt.get(...params);
          },
          run(...params) {
            if (params.length === 0) {
              const r2 = stmt.run();
              return { lastInsertRowid: r2?.lastInsertRowid ?? 0, changes: r2?.changes ?? 0 };
            }
            const r = stmt.run(...params);
            return { lastInsertRowid: r?.lastInsertRowid ?? 0, changes: r?.changes ?? 0 };
          }
        };
      }
      /**
       * Create a transaction
       */
      transaction(fn) {
        return this._db.transaction(fn);
      }
      /**
       * Close the connection
       */
      close() {
        this._db.close();
      }
    };
  }
});

// src/db/better-sqlite3-adapter.ts
var better_sqlite3_adapter_exports = {};
__export(better_sqlite3_adapter_exports, {
  Database: () => Database3
});
import BetterSqlite32 from "better-sqlite3";
var Database3, PreparedStatement;
var init_better_sqlite3_adapter = __esm({
  "src/db/better-sqlite3-adapter.ts"() {
    "use strict";
    Database3 = class {
      _db;
      _stmtCache = /* @__PURE__ */ new Map();
      constructor(path, options) {
        this._db = new BetterSqlite32(path, {
          // better-sqlite3 creates the file by default ('create' not needed)
          readonly: options?.readwrite === false ? true : false
        });
      }
      /**
       * Execute a SQL query without results.
       * PRAGMA statements are handled via better-sqlite3's native pragma() method.
       */
      run(sql, params) {
        const trimmed = sql.trim();
        if (/^PRAGMA\s+/i.test(trimmed)) {
          const pragmaBody = trimmed.replace(/^PRAGMA\s+/i, "").replace(/;$/, "");
          this._db.pragma(pragmaBody);
          return { lastInsertRowid: 0, changes: 0 };
        }
        const stmt = this._db.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return result;
      }
      /**
       * Prepare a query and return a cached prepared statement.
       * Returns a cached prepared statement for repeated queries.
       */
      query(sql) {
        let cached = this._stmtCache.get(sql);
        if (!cached) {
          cached = new PreparedStatement(this._db, sql);
          this._stmtCache.set(sql, cached);
        }
        return cached;
      }
      /**
       * Create a transaction
       */
      transaction(fn) {
        return this._db.transaction(fn);
      }
      /**
       * Close the connection
       */
      close() {
        this._stmtCache.clear();
        this._db.close();
      }
    };
    PreparedStatement = class {
      _stmt;
      constructor(db, sql) {
        this._stmt = db.prepare(sql);
      }
      /**
       * Adapt named parameters from $-prefixed format to plain keys.
       * Input:  { $todayStart: 123 }
       * Output: { todayStart: 123 }
       * (better-sqlite3 expects keys without the $ prefix)
       */
      _adaptParams(params) {
        if (params.length !== 1 || typeof params[0] !== "object" || params[0] === null || Array.isArray(params[0])) {
          return params;
        }
        const obj = params[0];
        const keys = Object.keys(obj);
        if (keys.length === 0) return params;
        if (!keys[0].startsWith("$") && !keys[0].startsWith("@") && !keys[0].startsWith(":")) {
          return params;
        }
        const adapted = {};
        for (const key of keys) {
          adapted[key.slice(1)] = obj[key];
        }
        return [adapted];
      }
      /**
       * Returns all rows
       */
      all(...params) {
        if (params.length === 0) return this._stmt.all();
        return this._stmt.all(...this._adaptParams(params));
      }
      /**
       * Returns the first row or null
       */
      get(...params) {
        if (params.length === 0) return this._stmt.get();
        return this._stmt.get(...this._adaptParams(params));
      }
      /**
       * Execute without results
       */
      run(...params) {
        if (params.length === 0) return this._stmt.run();
        return this._stmt.run(...this._adaptParams(params));
      }
    };
  }
});

// src/utils/secrets.ts
function redactSecrets(text) {
  if (!text) return text;
  let redacted = text;
  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => {
      const prefix = match.substring(0, Math.min(4, match.length));
      return `${prefix}***REDACTED***`;
    });
  }
  return redacted;
}
var SECRET_PATTERNS;
var init_secrets = __esm({
  "src/utils/secrets.ts"() {
    "use strict";
    SECRET_PATTERNS = [
      // AWS Access Keys (AKIA, ABIA, ACCA, ASIA prefixes + 16 alphanumeric chars)
      { name: "aws-key", pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g },
      // JWT tokens (three base64url segments separated by dots)
      { name: "jwt", pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
      // Generic API keys in key=value or key: value assignments
      { name: "api-key", pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi },
      // Password/secret/token in variable assignments
      { name: "credential", pattern: /(?:password|passwd|pwd|secret|token|auth[_-]?token|access[_-]?token|bearer)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi },
      // Credentials embedded in URLs (user:pass@host)
      { name: "url-credential", pattern: /(?:https?:\/\/)([^:]+):([^@]+)@/g },
      // PEM-encoded private keys (RSA, EC, DSA, OpenSSH)
      { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
      // GitHub personal access tokens (ghp_, gho_, ghu_, ghs_, ghr_ prefixes)
      { name: "github-token", pattern: /gh[pousr]_[a-zA-Z0-9]{36,}/g },
      // Slack bot/user/app tokens
      { name: "slack-token", pattern: /xox[bpoas]-[a-zA-Z0-9-]{10,}/g },
      // HTTP Authorization Bearer header values
      { name: "bearer-header", pattern: /\bBearer\s+([a-zA-Z0-9_\-\.]{20,})/g },
      // Generic hex secrets (32+ hex chars after a key/secret/token/password label)
      { name: "hex-secret", pattern: /(?:key|secret|token|password)\s*[:=]\s*['"]?([0-9a-f]{32,})['"]?/gi }
    ];
  }
});

// src/utils/categorizer.ts
function categorize(input) {
  const scores = /* @__PURE__ */ new Map();
  const searchText = [
    input.title,
    input.text || "",
    input.narrative || "",
    input.concepts || ""
  ].join(" ").toLowerCase();
  const allFiles = [input.filesModified || "", input.filesRead || ""].join(",");
  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (searchText.includes(kw.toLowerCase())) {
        score += rule.weight;
      }
    }
    if (rule.types && rule.types.includes(input.type)) {
      score += rule.weight * 2;
    }
    if (rule.filePatterns && allFiles) {
      for (const pattern of rule.filePatterns) {
        if (pattern.test(allFiles)) {
          score += rule.weight;
        }
      }
    }
    if (score > 0) {
      scores.set(rule.category, (scores.get(rule.category) || 0) + score);
    }
  }
  let bestCategory = "general";
  let bestScore = 0;
  for (const [category, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  return bestCategory;
}
var CATEGORY_RULES;
var init_categorizer = __esm({
  "src/utils/categorizer.ts"() {
    "use strict";
    CATEGORY_RULES = [
      {
        category: "security",
        keywords: [
          "security",
          "vulnerability",
          "cve",
          "xss",
          "csrf",
          "injection",
          "sanitize",
          "escape",
          "auth",
          "authentication",
          "authorization",
          "permission",
          "helmet",
          "cors",
          "rate-limit",
          "token",
          "encrypt",
          "decrypt",
          "secret",
          "redact",
          "owasp"
        ],
        filePatterns: [/security/i, /auth/i, /secrets?\.ts/i],
        weight: 10
      },
      {
        category: "testing",
        keywords: [
          "test",
          "spec",
          "expect",
          "assert",
          "mock",
          "stub",
          "fixture",
          "coverage",
          "jest",
          "vitest",
          "bun test",
          "unit test",
          "integration test",
          "e2e"
        ],
        types: ["test"],
        filePatterns: [/\.test\./i, /\.spec\./i, /tests?\//i, /__tests__/i],
        weight: 8
      },
      {
        category: "debugging",
        keywords: [
          "debug",
          "fix",
          "bug",
          "error",
          "crash",
          "stacktrace",
          "stack trace",
          "exception",
          "breakpoint",
          "investigate",
          "root cause",
          "troubleshoot",
          "diagnose",
          "bisect",
          "regression"
        ],
        types: ["bugfix"],
        weight: 8
      },
      {
        category: "architecture",
        keywords: [
          "architect",
          "design",
          "pattern",
          "modular",
          "migration",
          "schema",
          "database",
          "api design",
          "abstract",
          "dependency injection",
          "singleton",
          "factory",
          "observer",
          "middleware",
          "pipeline",
          "microservice",
          "monolith"
        ],
        types: ["decision", "constraint"],
        weight: 7
      },
      {
        category: "refactoring",
        keywords: [
          "refactor",
          "rename",
          "extract",
          "inline",
          "move",
          "split",
          "merge",
          "simplify",
          "cleanup",
          "clean up",
          "dead code",
          "consolidate",
          "reorganize",
          "restructure",
          "decouple"
        ],
        weight: 6
      },
      {
        category: "config",
        keywords: [
          "config",
          "configuration",
          "env",
          "environment",
          "dotenv",
          ".env",
          "settings",
          "tsconfig",
          "eslint",
          "prettier",
          "webpack",
          "vite",
          "esbuild",
          "docker",
          "ci/cd",
          "github actions",
          "deploy",
          "build",
          "bundle",
          "package.json"
        ],
        filePatterns: [
          /\.config\./i,
          /\.env/i,
          /tsconfig/i,
          /\.ya?ml/i,
          /Dockerfile/i,
          /docker-compose/i
        ],
        weight: 5
      },
      {
        category: "docs",
        keywords: [
          "document",
          "readme",
          "changelog",
          "jsdoc",
          "comment",
          "explain",
          "guide",
          "tutorial",
          "api doc",
          "openapi",
          "swagger"
        ],
        types: ["docs"],
        filePatterns: [/\.md$/i, /docs?\//i, /readme/i, /changelog/i],
        weight: 5
      },
      {
        category: "feature-dev",
        keywords: [
          "feature",
          "implement",
          "add",
          "create",
          "new",
          "endpoint",
          "component",
          "module",
          "service",
          "handler",
          "route",
          "hook",
          "plugin",
          "integration"
        ],
        types: ["feature", "file-write"],
        weight: 3
        // lowest — generic catch-all for development
      }
    ];
  }
});

// src/services/sqlite/Observations.ts
var Observations_exports = {};
__export(Observations_exports, {
  consolidateObservations: () => consolidateObservations,
  createObservation: () => createObservation,
  deleteObservation: () => deleteObservation,
  getObservationsByProject: () => getObservationsByProject,
  getObservationsBySession: () => getObservationsBySession,
  isDuplicateObservation: () => isDuplicateObservation,
  searchObservations: () => searchObservations,
  updateLastAccessed: () => updateLastAccessed
});
function escapeLikePattern(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function isDuplicateObservation(db, contentHash, windowMs = 3e4) {
  if (!contentHash) return false;
  const threshold = Date.now() - windowMs;
  const result = db.query(
    "SELECT id FROM observations WHERE content_hash = ? AND created_at_epoch > ? LIMIT 1"
  ).get(contentHash, threshold);
  return !!result;
}
function createObservation(db, memorySessionId, project, type, title, subtitle, text, narrative, facts, concepts, filesRead, filesModified, promptNumber, contentHash = null, discoveryTokens = 0) {
  const now = /* @__PURE__ */ new Date();
  const safeTitle = redactSecrets(title);
  const safeText = text ? redactSecrets(text) : text;
  const safeNarrative = narrative ? redactSecrets(narrative) : narrative;
  const autoCategory = categorize({
    type,
    title: safeTitle,
    text: safeText,
    narrative: safeNarrative,
    concepts,
    filesModified,
    filesRead
  });
  const result = db.run(
    `INSERT INTO observations
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens, auto_category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memorySessionId, project, type, safeTitle, subtitle, safeText, safeNarrative, facts, concepts, filesRead, filesModified, promptNumber, now.toISOString(), now.getTime(), contentHash, discoveryTokens, autoCategory]
  );
  return Number(result.lastInsertRowid);
}
function getObservationsBySession(db, memorySessionId) {
  const query = db.query(
    "SELECT * FROM observations WHERE memory_session_id = ? ORDER BY prompt_number ASC"
  );
  return query.all(memorySessionId);
}
function getObservationsByProject(db, project, limit = 100) {
  const query = db.query(
    "SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function searchObservations(db, searchTerm, project) {
  const sql = project ? `SELECT * FROM observations
       WHERE project = ? AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC, id DESC` : `SELECT * FROM observations
       WHERE title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC, id DESC`;
  const pattern = `%${escapeLikePattern(searchTerm)}%`;
  const query = db.query(sql);
  if (project) {
    return query.all(project, pattern, pattern, pattern);
  }
  return query.all(pattern, pattern, pattern);
}
function deleteObservation(db, id) {
  db.run("DELETE FROM observations WHERE id = ?", [id]);
}
function updateLastAccessed(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return;
  const now = Date.now();
  const placeholders = validIds.map(() => "?").join(",");
  db.run(
    `UPDATE observations SET last_accessed_epoch = ? WHERE id IN (${placeholders})`,
    [now, ...validIds]
  );
}
function consolidateObservations(db, project, options = {}) {
  const minGroupSize = options.minGroupSize || 3;
  const groups = db.query(`
    SELECT type, files_modified, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    GROUP BY type, files_modified
    HAVING cnt >= ?
    ORDER BY cnt DESC
  `).all(project, minGroupSize);
  if (groups.length === 0) return { merged: 0, removed: 0 };
  if (options.dryRun) {
    let totalMerged = 0;
    let totalRemoved = 0;
    for (const group of groups) {
      const obsIds = group.ids.split(",").map(Number);
      const placeholders = obsIds.map(() => "?").join(",");
      const count = db.query(
        `SELECT COUNT(*) as cnt FROM observations WHERE id IN (${placeholders})`
      ).get(...obsIds)?.cnt || 0;
      if (count >= minGroupSize) {
        totalMerged += 1;
        totalRemoved += count - 1;
      }
    }
    return { merged: totalMerged, removed: totalRemoved };
  }
  const runConsolidation = db.transaction(() => {
    let merged = 0;
    let removed = 0;
    for (const group of groups) {
      const obsIds = group.ids.split(",").map(Number);
      const placeholders = obsIds.map(() => "?").join(",");
      const observations = db.query(
        `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC, id DESC`
      ).all(...obsIds);
      if (observations.length < minGroupSize) continue;
      const keeper = observations[0];
      const others = observations.slice(1);
      const uniqueTexts = /* @__PURE__ */ new Set();
      if (keeper.text) uniqueTexts.add(keeper.text);
      for (const obs of others) {
        if (obs.text && !uniqueTexts.has(obs.text)) {
          uniqueTexts.add(obs.text);
        }
      }
      const consolidatedText = Array.from(uniqueTexts).join("\n---\n").substring(0, 1e5);
      db.run(
        "UPDATE observations SET text = ?, title = ? WHERE id = ?",
        [consolidatedText, `[consolidated x${observations.length}] ${keeper.title}`, keeper.id]
      );
      const removeIds = others.map((o) => o.id);
      const removePlaceholders = removeIds.map(() => "?").join(",");
      db.run(`DELETE FROM observations WHERE id IN (${removePlaceholders})`, removeIds);
      db.run(`DELETE FROM observation_embeddings WHERE observation_id IN (${removePlaceholders})`, removeIds);
      merged += 1;
      removed += removeIds.length;
    }
    return { merged, removed };
  });
  return runConsolidation();
}
var init_Observations = __esm({
  "src/services/sqlite/Observations.ts"() {
    "use strict";
    init_secrets();
    init_categorizer();
  }
});

// src/services/sqlite/Search.ts
var Search_exports = {};
__export(Search_exports, {
  getObservationsByIds: () => getObservationsByIds,
  getProjectStats: () => getProjectStats,
  getStaleObservations: () => getStaleObservations,
  getTimeline: () => getTimeline,
  markObservationsStale: () => markObservationsStale,
  searchObservationsFTS: () => searchObservationsFTS,
  searchObservationsFTSWithRank: () => searchObservationsFTSWithRank,
  searchObservationsLIKE: () => searchObservationsLIKE,
  searchSummariesFiltered: () => searchSummariesFiltered
});
import { existsSync as existsSync3, statSync as statSync2 } from "fs";
function escapeLikePattern3(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function sanitizeFTS5Query(query) {
  const trimmed = query.length > 1e4 ? query.substring(0, 1e4) : query;
  const terms = trimmed.replace(/[""\u0022]/g, "").split(/\s+/).filter((t) => t.length > 0).slice(0, 100).map((t) => `"${t}"`);
  return terms.join(" ");
}
function searchObservationsFTS(db, query, filters = {}) {
  const limit = filters.limit || 50;
  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return searchObservationsLIKE(db, query, filters);
    let sql = `
      SELECT o.* FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params = [safeQuery];
    if (filters.project) {
      sql += " AND o.project = ?";
      params.push(filters.project);
    }
    if (filters.type) {
      sql += " AND o.type = ?";
      params.push(filters.type);
    }
    if (filters.dateStart) {
      sql += " AND o.created_at_epoch >= ?";
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += " AND o.created_at_epoch <= ?";
      params.push(filters.dateEnd);
    }
    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);
    const stmt = db.query(sql);
    return stmt.all(...params);
  } catch {
    return searchObservationsLIKE(db, query, filters);
  }
}
function searchObservationsFTSWithRank(db, query, filters = {}) {
  const limit = filters.limit || 50;
  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return [];
    let sql = `
      SELECT o.*, bm25(observations_fts, ${BM25_WEIGHTS}) as fts5_rank FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params = [safeQuery];
    if (filters.project) {
      sql += " AND o.project = ?";
      params.push(filters.project);
    }
    if (filters.type) {
      sql += " AND o.type = ?";
      params.push(filters.type);
    }
    if (filters.dateStart) {
      sql += " AND o.created_at_epoch >= ?";
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += " AND o.created_at_epoch <= ?";
      params.push(filters.dateEnd);
    }
    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);
    const stmt = db.query(sql);
    return stmt.all(...params);
  } catch {
    return [];
  }
}
function searchObservationsLIKE(db, query, filters = {}) {
  const limit = filters.limit || 50;
  const pattern = `%${escapeLikePattern3(query)}%`;
  let sql = `
    SELECT * FROM observations
    WHERE (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\' OR concepts LIKE ? ESCAPE '\\')
  `;
  const params = [pattern, pattern, pattern, pattern];
  if (filters.project) {
    sql += " AND project = ?";
    params.push(filters.project);
  }
  if (filters.type) {
    sql += " AND type = ?";
    params.push(filters.type);
  }
  if (filters.dateStart) {
    sql += " AND created_at_epoch >= ?";
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += " AND created_at_epoch <= ?";
    params.push(filters.dateEnd);
  }
  sql += " ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
  params.push(limit);
  const stmt = db.query(sql);
  return stmt.all(...params);
}
function searchSummariesFiltered(db, query, filters = {}) {
  const limit = filters.limit || 20;
  const pattern = `%${escapeLikePattern3(query)}%`;
  let sql = `
    SELECT * FROM summaries
    WHERE (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR next_steps LIKE ? ESCAPE '\\')
  `;
  const params = [pattern, pattern, pattern, pattern, pattern];
  if (filters.project) {
    sql += " AND project = ?";
    params.push(filters.project);
  }
  if (filters.dateStart) {
    sql += " AND created_at_epoch >= ?";
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += " AND created_at_epoch <= ?";
    params.push(filters.dateEnd);
  }
  sql += " ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
  params.push(limit);
  const stmt = db.query(sql);
  return stmt.all(...params);
}
function getObservationsByIds(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return [];
  const placeholders = validIds.map(() => "?").join(",");
  const sql = `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC, id DESC`;
  const stmt = db.query(sql);
  return stmt.all(...validIds);
}
function getTimeline(db, anchorId, depthBefore = 5, depthAfter = 5) {
  const anchorStmt = db.query("SELECT created_at_epoch FROM observations WHERE id = ?");
  const anchor = anchorStmt.get(anchorId);
  if (!anchor) return [];
  const anchorEpoch = anchor.created_at_epoch;
  const beforeStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
    ORDER BY created_at_epoch DESC, id DESC
    LIMIT ?
  `);
  const before = beforeStmt.all(anchorEpoch, anchorEpoch, anchorId, depthBefore).reverse();
  const selfStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations WHERE id = ?
  `);
  const self = selfStmt.all(anchorId);
  const afterStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE (created_at_epoch > ? OR (created_at_epoch = ? AND id > ?))
    ORDER BY created_at_epoch ASC, id ASC
    LIMIT ?
  `);
  const after = afterStmt.all(anchorEpoch, anchorEpoch, anchorId, depthAfter);
  return [...before, ...self, ...after];
}
function getProjectStats(db, project) {
  const sql = `
    WITH
      obs_stats AS (
        SELECT
          COUNT(*) as count,
          COALESCE(SUM(discovery_tokens), 0) as discovery_tokens,
          COALESCE(SUM(
            CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)
          ), 0) as read_tokens
        FROM observations WHERE project = ?
      ),
      sum_count AS (SELECT COUNT(*) as count FROM summaries WHERE project = ?),
      ses_count AS (SELECT COUNT(*) as count FROM sessions WHERE project = ?),
      prm_count AS (SELECT COUNT(*) as count FROM prompts WHERE project = ?)
    SELECT
      obs_stats.count as observations,
      obs_stats.discovery_tokens,
      obs_stats.read_tokens,
      sum_count.count as summaries,
      ses_count.count as sessions,
      prm_count.count as prompts
    FROM obs_stats, sum_count, ses_count, prm_count
  `;
  const row = db.query(sql).get(project, project, project, project);
  const discoveryTokens = row?.discovery_tokens || 0;
  const readTokens = row?.read_tokens || 0;
  const savings = Math.max(0, discoveryTokens - readTokens);
  return {
    observations: row?.observations || 0,
    summaries: row?.summaries || 0,
    sessions: row?.sessions || 0,
    prompts: row?.prompts || 0,
    tokenEconomics: { discoveryTokens, readTokens, savings }
  };
}
function getStaleObservations(db, project) {
  const rows = db.query(`
    SELECT * FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    ORDER BY created_at_epoch DESC, id DESC
    LIMIT 500
  `).all(project);
  const staleObs = [];
  for (const obs of rows) {
    if (!obs.files_modified) continue;
    const files = obs.files_modified.split(",").map((f) => f.trim()).filter(Boolean);
    let isStale = false;
    for (const filepath of files) {
      try {
        if (!existsSync3(filepath)) continue;
        const stat = statSync2(filepath);
        if (stat.mtimeMs > obs.created_at_epoch) {
          isStale = true;
          break;
        }
      } catch {
      }
    }
    if (isStale) {
      staleObs.push(obs);
    }
  }
  return staleObs;
}
function markObservationsStale(db, ids, stale) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return;
  const placeholders = validIds.map(() => "?").join(",");
  db.run(
    `UPDATE observations SET is_stale = ? WHERE id IN (${placeholders})`,
    [stale ? 1 : 0, ...validIds]
  );
}
var BM25_WEIGHTS;
var init_Search = __esm({
  "src/services/sqlite/Search.ts"() {
    "use strict";
    BM25_WEIGHTS = "10.0, 1.0, 5.0, 3.0";
  }
});

// src/db/index.ts
var isBun = "Bun" in globalThis;
var DatabaseClass;
if (isBun) {
  const mod = await Promise.resolve().then(() => (init_bun_sqlite_adapter(), bun_sqlite_adapter_exports));
  DatabaseClass = mod.Database;
} else {
  const mod = await Promise.resolve().then(() => (init_better_sqlite3_adapter(), better_sqlite3_adapter_exports));
  DatabaseClass = mod.Database;
}
var Database4 = DatabaseClass;

// src/shared/paths.ts
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
function getDirname() {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}
var _dirname = getDirname();
var _legacyV1Dir = join(homedir(), ".contextkit");
var _canonicalDir = join(homedir(), ".totalrecall");
function getFileSize(path) {
  try {
    return existsSync(path) ? statSync(path).size : -1;
  } catch {
    return -1;
  }
}
function resolveDataDir() {
  const canonicalDb = join(_canonicalDir, "totalrecall.db");
  const legacyCanonicalNamedDb = join(_legacyV1Dir, "totalrecall.db");
  const legacyDb = join(_legacyV1Dir, "contextkit.db");
  const canonicalSize = getFileSize(canonicalDb);
  const legacySize = Math.max(getFileSize(legacyCanonicalNamedDb), getFileSize(legacyDb));
  if (canonicalSize > 0 && legacySize > 0) {
    return legacySize > canonicalSize ? _legacyV1Dir : _canonicalDir;
  }
  if (legacySize > 0) return _legacyV1Dir;
  if (canonicalSize > 0) return _canonicalDir;
  if (existsSync(_canonicalDir)) return _canonicalDir;
  if (existsSync(_legacyV1Dir)) return _legacyV1Dir;
  return _canonicalDir;
}
var DATA_DIR = process.env.TOTALRECALL_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || resolveDataDir();
var KIRO_CONFIG_DIR = process.env.KIRO_CONFIG_DIR || join(homedir(), ".kiro");
var PLUGIN_ROOT = join(KIRO_CONFIG_DIR, "plugins", "totalrecall");
var ARCHIVES_DIR = join(DATA_DIR, "archives");
var LOGS_DIR = join(DATA_DIR, "logs");
var TRASH_DIR = join(DATA_DIR, "trash");
var BACKUPS_DIR = join(DATA_DIR, "backups");
var MODES_DIR = join(DATA_DIR, "modes");
var USER_SETTINGS_PATH = join(DATA_DIR, "settings.json");
var _legacyDbV1 = join(DATA_DIR, "contextkit.db");
var _legacyDbV3 = join(DATA_DIR, "totalrecall.db");
function resolveDbPath() {
  if (existsSync(join(DATA_DIR, "totalrecall.db"))) return join(DATA_DIR, "totalrecall.db");
  if (existsSync(_legacyDbV3)) return _legacyDbV3;
  if (existsSync(_legacyDbV1)) return _legacyDbV1;
  return join(DATA_DIR, "totalrecall.db");
}
var DB_PATH = resolveDbPath();
var VECTOR_DB_DIR = join(DATA_DIR, "vector-db");
var OBSERVER_SESSIONS_DIR = join(DATA_DIR, "observer-sessions");
var KIRO_SETTINGS_PATH = join(KIRO_CONFIG_DIR, "settings.json");
var KIRO_CONTEXT_PATH = join(KIRO_CONFIG_DIR, "context.md");
function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

// src/utils/logger.ts
import { appendFileSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync } from "fs";
import { join as join2 } from "path";
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
  LogLevel2[LogLevel2["SILENT"] = 4] = "SILENT";
  return LogLevel2;
})(LogLevel || {});
var Logger = class {
  level = null;
  useColor;
  logFilePath = null;
  logFileInitialized = false;
  constructor() {
    this.useColor = process.stdout.isTTY ?? false;
  }
  /**
   * Initialize log file path and ensure directory exists (lazy initialization)
   */
  ensureLogFileInitialized() {
    if (this.logFileInitialized) return;
    this.logFileInitialized = true;
    try {
      if (!existsSync2(LOGS_DIR)) {
        mkdirSync2(LOGS_DIR, { recursive: true });
      }
      const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      this.logFilePath = join2(LOGS_DIR, `totalrecall-${date}.log`);
    } catch (error) {
      console.error("[LOGGER] Failed to initialize log file:", error);
      this.logFilePath = null;
    }
  }
  /**
   * Lazy-load log level from settings file
   */
  getLevel() {
    if (this.level === null) {
      try {
        if (existsSync2(USER_SETTINGS_PATH)) {
          const settingsData = readFileSync(USER_SETTINGS_PATH, "utf-8");
          const settings = JSON.parse(settingsData);
          const envLevel = (settings.TOTALRECALL_LOG_LEVEL || settings.CONTEXTKIT_LOG_LEVEL || "INFO").toUpperCase();
          this.level = LogLevel[envLevel] ?? 1 /* INFO */;
        } else {
          this.level = 1 /* INFO */;
        }
      } catch (error) {
        this.level = 1 /* INFO */;
      }
    }
    return this.level;
  }
  /**
   * Create correlation ID for tracking an observation through the pipeline
   */
  correlationId(sessionId, observationNum) {
    return `obs-${sessionId}-${observationNum}`;
  }
  /**
   * Create session correlation ID
   */
  sessionId(sessionId) {
    return `session-${sessionId}`;
  }
  /**
   * Format data for logging - create compact summaries instead of full dumps
   */
  formatData(data) {
    if (data === null || data === void 0) return "";
    if (typeof data === "string") return data;
    if (typeof data === "number") return data.toString();
    if (typeof data === "boolean") return data.toString();
    if (typeof data === "object") {
      if (data instanceof Error) {
        return this.getLevel() === 0 /* DEBUG */ ? `${data.message}
${data.stack}` : data.message;
      }
      if (Array.isArray(data)) {
        return `[${data.length} items]`;
      }
      const keys = Object.keys(data);
      if (keys.length === 0) return "{}";
      if (keys.length <= 3) {
        return JSON.stringify(data);
      }
      return `{${keys.length} keys: ${keys.slice(0, 3).join(", ")}...}`;
    }
    return String(data);
  }
  /**
   * Format timestamp in local timezone (YYYY-MM-DD HH:MM:SS.mmm)
   */
  formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  }
  /**
   * Core logging method
   */
  log(level, component, message, context, data) {
    if (level < this.getLevel()) return;
    this.ensureLogFileInitialized();
    const timestamp = this.formatTimestamp(/* @__PURE__ */ new Date());
    const levelStr = LogLevel[level].padEnd(5);
    const componentStr = component.padEnd(6);
    let correlationStr = "";
    if (context?.correlationId) {
      correlationStr = `[${context.correlationId}] `;
    } else if (context?.sessionId) {
      correlationStr = `[session-${context.sessionId}] `;
    }
    let dataStr = "";
    if (data !== void 0 && data !== null) {
      if (data instanceof Error) {
        dataStr = this.getLevel() === 0 /* DEBUG */ ? `
${data.message}
${data.stack}` : ` ${data.message}`;
      } else if (this.getLevel() === 0 /* DEBUG */ && typeof data === "object") {
        dataStr = "\n" + JSON.stringify(data, null, 2);
      } else {
        dataStr = " " + this.formatData(data);
      }
    }
    let contextStr = "";
    if (context) {
      const { sessionId, memorySessionId, correlationId, ...rest } = context;
      if (Object.keys(rest).length > 0) {
        const pairs = Object.entries(rest).map(([k, v]) => `${k}=${v}`);
        contextStr = ` {${pairs.join(", ")}}`;
      }
    }
    const logLine = `[${timestamp}] [${levelStr}] [${componentStr}] ${correlationStr}${message}${contextStr}${dataStr}`;
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, logLine + "\n", "utf8");
      } catch (error) {
        process.stderr.write(`[LOGGER] Failed to write to log file: ${error}
`);
      }
    } else {
      process.stderr.write(logLine + "\n");
    }
  }
  // Public logging methods
  debug(component, message, context, data) {
    this.log(0 /* DEBUG */, component, message, context, data);
  }
  info(component, message, context, data) {
    this.log(1 /* INFO */, component, message, context, data);
  }
  warn(component, message, context, data) {
    this.log(2 /* WARN */, component, message, context, data);
  }
  error(component, message, context, data) {
    this.log(3 /* ERROR */, component, message, context, data);
  }
  /**
   * Log data flow: input → processing
   */
  dataIn(component, message, context, data) {
    this.info(component, `\u2192 ${message}`, context, data);
  }
  /**
   * Log data flow: processing → output
   */
  dataOut(component, message, context, data) {
    this.info(component, `\u2190 ${message}`, context, data);
  }
  /**
   * Log successful completion
   */
  success(component, message, context, data) {
    this.info(component, `\u2713 ${message}`, context, data);
  }
  /**
   * Log failure
   */
  failure(component, message, context, data) {
    this.error(component, `\u2717 ${message}`, context, data);
  }
  /**
   * Log timing information
   */
  timing(component, message, durationMs, context) {
    this.info(component, `\u23F1 ${message}`, context, { duration: `${durationMs}ms` });
  }
  /**
   * Happy Path Error - logs when the expected "happy path" fails but we have a fallback
   */
  happyPathError(component, message, context, data, fallback = "") {
    const stack = new Error().stack || "";
    const stackLines = stack.split("\n");
    const callerLine = stackLines[2] || "";
    const callerMatch = callerLine.match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/);
    const location = callerMatch ? `${callerMatch[1].split("/").pop()}:${callerMatch[2]}` : "unknown";
    const enhancedContext = {
      ...context,
      location
    };
    this.warn(component, `[HAPPY-PATH] ${message}`, enhancedContext, data);
    return fallback;
  }
};
var logger = new Logger();

// src/services/sqlite/Database.ts
var SQLITE_MMAP_SIZE_BYTES = 256 * 1024 * 1024;
var SQLITE_CACHE_SIZE_PAGES = 1e4;
var TotalRecallDatabase = class {
  _db;
  /**
   * Readonly accessor for the underlying Database instance.
   * Prefer using query() and run() proxy methods directly.
   */
  get db() {
    return this._db;
  }
  /**
   * @param dbPath - Path to the SQLite file (default: DB_PATH)
   * @param skipMigrations - If true, skip the migration runner (for high-frequency hooks)
   */
  constructor(dbPath = DB_PATH, skipMigrations = false) {
    if (dbPath !== ":memory:") {
      ensureDir(DATA_DIR);
    }
    this._db = new Database4(dbPath, { create: true, readwrite: true });
    this._db.run("PRAGMA journal_mode = WAL");
    this._db.run("PRAGMA busy_timeout = 5000");
    this._db.run("PRAGMA synchronous = NORMAL");
    this._db.run("PRAGMA foreign_keys = ON");
    this._db.run("PRAGMA temp_store = memory");
    this._db.run(`PRAGMA mmap_size = ${SQLITE_MMAP_SIZE_BYTES}`);
    this._db.run(`PRAGMA cache_size = ${SQLITE_CACHE_SIZE_PAGES}`);
    if (!skipMigrations) {
      const migrationRunner = new MigrationRunner(this._db);
      migrationRunner.runAllMigrations();
    }
  }
  /**
   * Prepare a query (delegates to underlying Database).
   * Proxy method to avoid ctx.db.db.query() double access.
   */
  query(sql) {
    return this._db.query(sql);
  }
  /**
   * Execute a SQL statement without results (delegates to underlying Database).
   * Proxy method to avoid ctx.db.db.run() double access.
   */
  run(sql, params) {
    return this._db.run(sql, params);
  }
  /**
   * Executes a function within an atomic transaction.
   * If fn() throws an error, the transaction is automatically rolled back.
   */
  withTransaction(fn) {
    const transaction = this._db.transaction(fn);
    return transaction(this._db);
  }
  /**
   * Close the database connection
   */
  close() {
    this._db.close();
  }
};
var MigrationRunner = class {
  db;
  constructor(db) {
    this.db = db;
  }
  runAllMigrations() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    const versionQuery = this.db.query("SELECT MAX(version) as version FROM schema_versions");
    const result = versionQuery.get();
    const currentVersion = result?.version || 0;
    const migrations = this.getMigrations();
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        logger.info("DB", `Applying migration ${migration.version}`);
        const transaction = this.db.transaction(() => {
          migration.up(this.db);
          const insert = this.db.query("INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)");
          insert.run(migration.version, (/* @__PURE__ */ new Date()).toISOString());
        });
        transaction();
        logger.info("DB", `Migration ${migration.version} applied successfully`);
      }
    }
  }
  getMigrations() {
    return [
      {
        version: 1,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL UNIQUE,
              project TEXT NOT NULL,
              user_prompt TEXT NOT NULL,
              memory_session_id TEXT,
              status TEXT DEFAULT 'active',
              started_at TEXT NOT NULL,
              started_at_epoch INTEGER NOT NULL,
              completed_at TEXT,
              completed_at_epoch INTEGER
            )
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS observations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memory_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              subtitle TEXT,
              text TEXT,
              narrative TEXT,
              facts TEXT,
              concepts TEXT,
              files_read TEXT,
              files_modified TEXT,
              prompt_number INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS summaries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              request TEXT,
              investigated TEXT,
              learned TEXT,
              completed TEXT,
              next_steps TEXT,
              notes TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS prompts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              prompt_number INTEGER NOT NULL,
              prompt_text TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS pending_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              type TEXT NOT NULL,
              data TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(memory_session_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_session ON prompts(content_session_id)");
        }
      },
      {
        version: 2,
        up: (db) => {
          db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
              title, text, narrative, concepts,
              content='observations',
              content_rowid='id'
            )
          `);
          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);
          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
            END
          `);
          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);
          db.run(`
            INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
            SELECT id, title, text, narrative, concepts FROM observations
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_epoch ON observations(created_at_epoch)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_project ON summaries(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_epoch ON summaries(created_at_epoch)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project)");
        }
      },
      {
        version: 3,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS project_aliases (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_name TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `);
          db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_project_aliases_name ON project_aliases(project_name)");
        }
      },
      {
        version: 4,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS observation_embeddings (
              observation_id INTEGER PRIMARY KEY,
              embedding BLOB NOT NULL,
              model TEXT NOT NULL,
              dimensions INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_embeddings_model ON observation_embeddings(model)");
        }
      },
      {
        version: 5,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN last_accessed_epoch INTEGER");
          db.run("ALTER TABLE observations ADD COLUMN is_stale INTEGER DEFAULT 0");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_last_accessed ON observations(last_accessed_epoch)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_stale ON observations(is_stale)");
        }
      },
      {
        version: 6,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS checkpoints (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id INTEGER NOT NULL,
              project TEXT NOT NULL,
              task TEXT NOT NULL,
              progress TEXT,
              next_steps TEXT,
              open_questions TEXT,
              relevant_files TEXT,
              context_snapshot TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_epoch ON checkpoints(created_at_epoch)");
        }
      },
      {
        version: 7,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_hash ON observations(content_hash)");
        }
      },
      {
        version: 8,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0");
          db.run("ALTER TABLE summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0");
        }
      },
      {
        version: 9,
        up: (db) => {
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project_epoch ON observations(project, created_at_epoch DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project_type ON observations(project, type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_project_epoch ON summaries(project, created_at_epoch DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_project_epoch ON prompts(project, created_at_epoch DESC)");
        }
      },
      {
        version: 10,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS job_queue (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              payload TEXT,
              result TEXT,
              error TEXT,
              retry_count INTEGER DEFAULT 0,
              max_retries INTEGER DEFAULT 3,
              priority INTEGER DEFAULT 0,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              started_at_epoch INTEGER,
              completed_at_epoch INTEGER
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_queue(status)");
          db.run("CREATE INDEX IF NOT EXISTS idx_jobs_type ON job_queue(type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_jobs_priority ON job_queue(status, priority DESC, created_at_epoch ASC)");
        }
      },
      {
        version: 11,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN auto_category TEXT");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_category ON observations(auto_category)");
        }
      },
      {
        version: 12,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS github_links (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              observation_id INTEGER,
              session_id TEXT,
              repo TEXT NOT NULL,
              issue_number INTEGER,
              pr_number INTEGER,
              event_type TEXT NOT NULL,
              action TEXT,
              title TEXT,
              url TEXT,
              author TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              FOREIGN KEY (observation_id) REFERENCES observations(id)
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_repo ON github_links(repo)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_obs ON github_links(observation_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_event ON github_links(event_type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_repo_issue ON github_links(repo, issue_number)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_repo_pr ON github_links(repo, pr_number)");
        }
      },
      {
        version: 13,
        up: (db) => {
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_keyset ON observations(created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project_keyset ON observations(project, created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_keyset ON summaries(created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_project_keyset ON summaries(project, created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_keyset ON prompts(created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_project_keyset ON prompts(project, created_at_epoch DESC, id DESC)");
        }
      },
      {
        version: 14,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS conversation_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              role TEXT NOT NULL,
              message_index INTEGER NOT NULL,
              content TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              UNIQUE(content_session_id, message_index)
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_conversation_messages_session ON conversation_messages(content_session_id, message_index ASC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_conversation_messages_project_epoch ON conversation_messages(project, created_at_epoch DESC)");
        }
      },
      {
        version: 15,
        up: (db) => {
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
          db.run("CREATE INDEX IF NOT EXISTS idx_shared_tokens_token ON shared_tokens(token)");
          db.run("CREATE INDEX IF NOT EXISTS idx_shared_tokens_project ON shared_tokens(project)");
        }
      },
      {
        version: 16,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'viewer',
              display_name TEXT NOT NULL,
              avatar_url TEXT,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              last_login TEXT
            )
          `);
          db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)");
          db.run("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)");
          db.run(`
            CREATE TABLE IF NOT EXISTS sessions_auth (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              token TEXT NOT NULL,
              refresh_token TEXT NOT NULL UNIQUE,
              expires_at TEXT NOT NULL,
              refresh_expires_at TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_sessions_auth_user ON sessions_auth(user_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_sessions_auth_token ON sessions_auth(token)");
          db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_auth_refresh ON sessions_auth(refresh_token)");
          db.run(`
            CREATE TABLE IF NOT EXISTS audit_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              action TEXT NOT NULL,
              target TEXT,
              details TEXT,
              ip_address TEXT,
              timestamp TEXT NOT NULL
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)");
        }
      }
    ];
  }
};

// src/services/sqlite/cursor.ts
function encodeCursor(id, epoch) {
  const raw = `${epoch}:${id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}
function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const colonIdx = raw.indexOf(":");
    if (colonIdx === -1) return null;
    const epochStr = raw.substring(0, colonIdx);
    const idStr = raw.substring(colonIdx + 1);
    const epoch = parseInt(epochStr, 10);
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(epoch) || epoch <= 0) return null;
    if (!Number.isInteger(id) || id <= 0) return null;
    return { epoch, id };
  } catch {
    return null;
  }
}

// src/services/sqlite/Sessions.ts
function createSession(db, contentSessionId, project, userPrompt) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO sessions (content_session_id, project, user_prompt, status, started_at, started_at_epoch)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [contentSessionId, project, userPrompt, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getSessionByContentId(db, contentSessionId) {
  const query = db.query("SELECT * FROM sessions WHERE content_session_id = ?");
  return query.get(contentSessionId);
}
function updateSessionUserPrompt(db, contentSessionId, userPrompt) {
  db.run(
    "UPDATE sessions SET user_prompt = ? WHERE content_session_id = ?",
    [userPrompt, contentSessionId]
  );
}
function completeSession(db, id) {
  const now = /* @__PURE__ */ new Date();
  db.run(
    `UPDATE sessions 
     SET status = 'completed', completed_at = ?, completed_at_epoch = ?
     WHERE id = ?`,
    [now.toISOString(), now.getTime(), id]
  );
}

// src/services/sqlite/index.ts
init_Observations();

// src/services/sqlite/Summaries.ts
function escapeLikePattern2(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function createSummary(db, sessionId, project, request, investigated, learned, completed, nextSteps, notes) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO summaries 
     (session_id, project, request, investigated, learned, completed, next_steps, notes, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, project, request, investigated, learned, completed, nextSteps, notes, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getSummariesByProject(db, project, limit = 50) {
  const query = db.query(
    "SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function searchSummaries(db, searchTerm, project) {
  const sql = project ? `SELECT * FROM summaries
       WHERE project = ? AND (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC, id DESC` : `SELECT * FROM summaries
       WHERE request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC, id DESC`;
  const pattern = `%${escapeLikePattern2(searchTerm)}%`;
  const query = db.query(sql);
  if (project) {
    return query.all(project, pattern, pattern, pattern, pattern);
  }
  return query.all(pattern, pattern, pattern, pattern);
}

// src/services/sqlite/Prompts.ts
function createPrompt(db, contentSessionId, project, promptNumber, promptText) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO prompts 
     (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [contentSessionId, project, promptNumber, promptText, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getPromptsByProject(db, project, limit = 100) {
  const query = db.query(
    "SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?"
  );
  return query.all(project, limit);
}

// src/services/sqlite/ConversationMessages.ts
function createConversationMessage(db, contentSessionId, project, role, messageIndex, content, createdAt, createdAtEpoch) {
  const timestamp = createdAt || (/* @__PURE__ */ new Date()).toISOString();
  const epoch = createdAtEpoch ?? Date.now();
  const result = db.run(
    `INSERT OR IGNORE INTO conversation_messages
     (content_session_id, project, role, message_index, content, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [contentSessionId, project, role, messageIndex, content, timestamp, epoch]
  );
  return Number(result.lastInsertRowid || 0);
}
function getConversationMessagesBySession(db, contentSessionId) {
  const query = db.query(
    `SELECT * FROM conversation_messages
     WHERE content_session_id = ?
     ORDER BY message_index ASC, id ASC`
  );
  return query.all(contentSessionId);
}
function getConversationMessageCountBySession(db, contentSessionId) {
  const query = db.query(
    "SELECT COUNT(*) as total FROM conversation_messages WHERE content_session_id = ?"
  );
  const result = query.get(contentSessionId);
  return result?.total || 0;
}

// src/services/sqlite/Checkpoints.ts
function createCheckpoint(db, sessionId, project, data) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO checkpoints (session_id, project, task, progress, next_steps, open_questions, relevant_files, context_snapshot, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      project,
      data.task,
      data.progress || null,
      data.nextSteps || null,
      data.openQuestions || null,
      data.relevantFiles || null,
      data.contextSnapshot || null,
      now.toISOString(),
      now.getTime()
    ]
  );
  return Number(result.lastInsertRowid);
}
function getLatestCheckpoint(db, sessionId) {
  const query = db.query(
    "SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1"
  );
  return query.get(sessionId);
}
function getLatestCheckpointByProject(db, project) {
  const query = db.query(
    "SELECT * FROM checkpoints WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1"
  );
  return query.get(project);
}

// src/services/sqlite/Reports.ts
function getReportData(db, project, startEpoch, endEpoch) {
  const startDate = new Date(startEpoch);
  const endDate = new Date(endEpoch);
  const days = Math.ceil((endEpoch - startEpoch) / (24 * 60 * 60 * 1e3));
  const label = days <= 7 ? "Weekly" : days <= 31 ? "Monthly" : "Custom";
  const countInRange = (table, epochCol = "created_at_epoch") => {
    const sql = project ? `SELECT COUNT(*) as count FROM ${table} WHERE project = ? AND ${epochCol} >= ? AND ${epochCol} <= ?` : `SELECT COUNT(*) as count FROM ${table} WHERE ${epochCol} >= ? AND ${epochCol} <= ?`;
    const stmt = db.query(sql);
    const row = project ? stmt.get(project, startEpoch, endEpoch) : stmt.get(startEpoch, endEpoch);
    return row?.count || 0;
  };
  const observations = countInRange("observations");
  const summaries = countInRange("summaries");
  const prompts = countInRange("prompts");
  const sessions = countInRange("sessions", "started_at_epoch");
  const timelineSql = project ? `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC` : `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC`;
  const timelineStmt = db.query(timelineSql);
  const timeline = project ? timelineStmt.all(project, startEpoch, endEpoch) : timelineStmt.all(startEpoch, endEpoch);
  const typeSql = project ? `SELECT type, COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC` : `SELECT type, COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC`;
  const typeStmt = db.query(typeSql);
  const typeDistribution = project ? typeStmt.all(project, startEpoch, endEpoch) : typeStmt.all(startEpoch, endEpoch);
  const sessionTotalSql = project ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?` : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ?`;
  const sessionTotal = (project ? db.query(sessionTotalSql).get(project, startEpoch, endEpoch)?.count : db.query(sessionTotalSql).get(startEpoch, endEpoch)?.count) || 0;
  const sessionCompletedSql = project ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'` : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'`;
  const sessionCompleted = (project ? db.query(sessionCompletedSql).get(project, startEpoch, endEpoch)?.count : db.query(sessionCompletedSql).get(startEpoch, endEpoch)?.count) || 0;
  const sessionAvgSql = project ? `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch` : `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch`;
  const avgRow = project ? db.query(sessionAvgSql).get(project, startEpoch, endEpoch) : db.query(sessionAvgSql).get(startEpoch, endEpoch);
  const avgDurationMinutes = Math.round((avgRow?.avg_min || 0) * 10) / 10;
  const knowledgeSql = project ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')` : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')`;
  const knowledgeCount = (project ? db.query(knowledgeSql).get(project, startEpoch, endEpoch)?.count : db.query(knowledgeSql).get(startEpoch, endEpoch)?.count) || 0;
  const staleSql = project ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1` : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1`;
  const staleCount = (project ? db.query(staleSql).get(project, startEpoch, endEpoch)?.count : db.query(staleSql).get(startEpoch, endEpoch)?.count) || 0;
  const summarySql = project ? `SELECT learned, completed, next_steps FROM summaries
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC, id DESC` : `SELECT learned, completed, next_steps FROM summaries
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC, id DESC`;
  const summaryRows = project ? db.query(summarySql).all(project, startEpoch, endEpoch) : db.query(summarySql).all(startEpoch, endEpoch);
  const topLearnings = [];
  const completedTasks = [];
  const nextStepsArr = [];
  for (const row of summaryRows) {
    if (row.learned) {
      const parts = row.learned.split("; ").filter(Boolean);
      topLearnings.push(...parts);
    }
    if (row.completed) {
      const parts = row.completed.split("; ").filter(Boolean);
      completedTasks.push(...parts);
    }
    if (row.next_steps) {
      const parts = row.next_steps.split("; ").filter(Boolean);
      nextStepsArr.push(...parts);
    }
  }
  const filesSql = project ? `SELECT files_modified FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''` : `SELECT files_modified FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''`;
  const fileRows = project ? db.query(filesSql).all(project, startEpoch, endEpoch) : db.query(filesSql).all(startEpoch, endEpoch);
  const fileCounts = /* @__PURE__ */ new Map();
  for (const row of fileRows) {
    const files = row.files_modified.split(",").map((f) => f.trim()).filter(Boolean);
    for (const file of files) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
  }
  const fileHotspots = Array.from(fileCounts.entries()).map(([file, count]) => ({ file, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  return {
    period: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
      days,
      label
    },
    overview: {
      observations,
      summaries,
      sessions,
      prompts,
      knowledgeCount,
      staleCount
    },
    timeline,
    typeDistribution,
    sessionStats: {
      total: sessionTotal,
      completed: sessionCompleted,
      avgDurationMinutes
    },
    topLearnings: [...new Set(topLearnings)].slice(0, 10),
    completedTasks: [...new Set(completedTasks)].slice(0, 10),
    nextSteps: [...new Set(nextStepsArr)].slice(0, 10),
    fileHotspots
  };
}

// src/services/sqlite/index.ts
init_Search();

// src/types/worker-types.ts
var KNOWLEDGE_TYPES = ["constraint", "decision", "heuristic", "rejected"];

// src/services/sqlite/Retention.ts
var KNOWLEDGE_TYPE_LIST = KNOWLEDGE_TYPES;
var KNOWLEDGE_PLACEHOLDERS = KNOWLEDGE_TYPE_LIST.map(() => "?").join(", ");

// src/sdk/index.ts
init_Observations();
import { createHash } from "crypto";
init_Search();

// src/services/search/EmbeddingService.ts
var MODEL_CONFIGS = {
  "all-MiniLM-L6-v2": {
    modelId: "Xenova/all-MiniLM-L6-v2",
    dimensions: 384
  },
  "jina-code-v2": {
    modelId: "jinaai/jina-embeddings-v2-base-code",
    dimensions: 768
  },
  "bge-small-en": {
    modelId: "BAAI/bge-small-en-v1.5",
    dimensions: 384
  }
};
var FASTEMBED_COMPATIBLE_MODELS = /* @__PURE__ */ new Set(["all-MiniLM-L6-v2", "bge-small-en"]);
var EmbeddingService = class {
  provider = null;
  model = null;
  initialized = false;
  initializing = null;
  config;
  configName;
  constructor() {
    const envModel = process.env.TOTALRECALL_EMBEDDING_MODEL || "all-MiniLM-L6-v2";
    this.configName = envModel;
    if (MODEL_CONFIGS[envModel]) {
      this.config = MODEL_CONFIGS[envModel];
    } else if (envModel.includes("/")) {
      const dimensions = parseInt(process.env.TOTALRECALL_EMBEDDING_DIMENSIONS || "384", 10);
      this.config = {
        modelId: envModel,
        dimensions: isNaN(dimensions) ? 384 : dimensions
      };
    } else {
      logger.warn("EMBEDDING", `Unknown model name '${envModel}', falling back to 'all-MiniLM-L6-v2'`);
      this.configName = "all-MiniLM-L6-v2";
      this.config = MODEL_CONFIGS["all-MiniLM-L6-v2"];
    }
  }
  /**
   * Initialize the embedding service.
   * Tries fastembed (when compatible), then @huggingface/transformers, then falls back to null.
   */
  async initialize() {
    if (this.initialized) return this.provider !== null;
    if (this.initializing) return this.initializing;
    this.initializing = this._doInitialize();
    const result = await this.initializing;
    this.initializing = null;
    return result;
  }
  async _doInitialize() {
    const fastembedCompatible = FASTEMBED_COMPATIBLE_MODELS.has(this.configName);
    if (fastembedCompatible) {
      try {
        const fastembed = await import("fastembed");
        const EmbeddingModel = fastembed.EmbeddingModel || fastembed.default?.EmbeddingModel;
        const FlagEmbedding = fastembed.FlagEmbedding || fastembed.default?.FlagEmbedding;
        if (FlagEmbedding && EmbeddingModel) {
          this.model = await FlagEmbedding.init({
            model: EmbeddingModel.BGESmallENV15
          });
          this.provider = "fastembed";
          this.initialized = true;
          logger.info("EMBEDDING", `Initialized with fastembed (BGE-small-en-v1.5) for model '${this.configName}'`);
          return true;
        }
      } catch (error) {
        logger.debug("EMBEDDING", `fastembed not available: ${error}`);
      }
    }
    try {
      const transformers = await import("@huggingface/transformers");
      const pipeline = transformers.pipeline || transformers.default?.pipeline;
      if (pipeline) {
        this.model = await pipeline("feature-extraction", this.config.modelId, {
          quantized: true
        });
        this.provider = "transformers";
        this.initialized = true;
        logger.info("EMBEDDING", `Initialized with @huggingface/transformers (${this.config.modelId})`);
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `@huggingface/transformers not available: ${error}`);
    }
    this.provider = null;
    this.initialized = true;
    logger.warn("EMBEDDING", "No embedding provider available, semantic search disabled");
    return false;
  }
  /**
   * Generate embedding for a single text.
   * Returns Float32Array with configured dimensions, or null if not available.
   */
  async embed(text) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return null;
    try {
      const truncated = text.substring(0, 2e3);
      if (this.provider === "fastembed") {
        return await this._embedFastembed(truncated);
      } else if (this.provider === "transformers") {
        return await this._embedTransformers(truncated);
      }
    } catch (error) {
      logger.error("EMBEDDING", `Error generating embedding: ${error}`);
    }
    return null;
  }
  /**
   * Generate embeddings in batch.
   * Uses native batch support when available (fastembed, transformers),
   * falls back to serial processing on batch failure.
   */
  async embedBatch(texts) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return texts.map(() => null);
    if (texts.length === 0) return [];
    const truncated = texts.map((t) => t.substring(0, 2e3));
    try {
      if (this.provider === "fastembed") {
        return await this._embedBatchFastembed(truncated);
      } else if (this.provider === "transformers") {
        return await this._embedBatchTransformers(truncated);
      }
    } catch (error) {
      logger.warn("EMBEDDING", `Batch embedding failed, falling back to serial: ${error}`);
    }
    return this._embedBatchSerial(truncated);
  }
  /**
   * Check if the service is available.
   */
  isAvailable() {
    return this.initialized && this.provider !== null;
  }
  /**
   * Name of the active provider.
   */
  getProvider() {
    return this.provider;
  }
  /**
   * Embedding vector dimensions for the active model configuration.
   */
  getDimensions() {
    return this.config.dimensions;
  }
  /**
   * Human-readable model name used as identifier in the observation_embeddings table.
   * Returns the short name (e.g., 'all-MiniLM-L6-v2') or the full HF model ID for custom models.
   */
  getModelName() {
    return this.configName;
  }
  // --- Batch implementations ---
  /**
   * Native batch embedding with fastembed.
   * FlagEmbedding.embed() accepts string[] and returns an async iterable of batches.
   */
  async _embedBatchFastembed(texts) {
    const results = [];
    const embeddings = this.model.embed(texts, texts.length);
    for await (const batch of embeddings) {
      if (batch) {
        for (const vec of batch) {
          results.push(vec instanceof Float32Array ? vec : new Float32Array(vec));
        }
      }
    }
    while (results.length < texts.length) {
      results.push(null);
    }
    return results;
  }
  /**
   * Batch embedding with @huggingface/transformers pipeline.
   * The pipeline accepts string[] and returns a Tensor with shape [N, dims].
   */
  async _embedBatchTransformers(texts) {
    const output = await this.model(texts, {
      pooling: "mean",
      normalize: true
    });
    if (!output?.data) {
      return texts.map(() => null);
    }
    const dims = this.getDimensions();
    const data = output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
    const results = [];
    for (let i = 0; i < texts.length; i++) {
      const offset = i * dims;
      if (offset + dims <= data.length) {
        results.push(data.slice(offset, offset + dims));
      } else {
        results.push(null);
      }
    }
    return results;
  }
  /**
   * Serial fallback: embed texts one at a time.
   * Used when native batch fails.
   */
  async _embedBatchSerial(texts) {
    const results = [];
    for (const text of texts) {
      try {
        const embedding = await this.embed(text);
        results.push(embedding);
      } catch {
        results.push(null);
      }
    }
    return results;
  }
  // --- Single-text provider implementations ---
  async _embedFastembed(text) {
    const embeddings = this.model.embed([text], 1);
    for await (const batch of embeddings) {
      if (batch && batch.length > 0) {
        const vec = batch[0];
        return vec instanceof Float32Array ? vec : new Float32Array(vec);
      }
    }
    return null;
  }
  async _embedTransformers(text) {
    const output = await this.model(text, {
      pooling: "mean",
      normalize: true
    });
    if (output?.data) {
      return output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
    }
    return null;
  }
};
var embeddingService = null;
function getEmbeddingService() {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

// src/services/search/VectorSearch.ts
var DEFAULT_MAX_CANDIDATES = 2e3;
function cosineSimilarity(a, b) {
  const len = a.length;
  if (len !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denominator = Math.sqrt(normA * normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
function float32ToBuffer(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}
function bufferToFloat32(buf) {
  if (typeof buf === "string") {
    const buffer = Buffer.from(buf, "binary");
    if (buffer.byteLength === 0 || buffer.byteLength % 4 !== 0) {
      throw new Error("Invalid embedding: corrupted TEXT storage");
    }
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }
  if (buf.byteLength === 0 || buf.byteLength % 4 !== 0) {
    throw new Error("Invalid embedding: zero-length or misaligned");
  }
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(arrayBuffer);
}
var VectorSearch = class {
  /**
   * Semantic search with SQL pre-filtering for scalability.
   *
   * 2-phase strategy:
   * 1. SQL pre-filters by project + sorts by recency (loads max N candidates)
   * 2. JS computes cosine similarity only on filtered candidates
   *
   * With 50k observations and maxCandidates=2000, loads only ~4% of data.
   */
  async search(db, queryEmbedding, options = {}) {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.3;
    const maxCandidates = options.maxCandidates || DEFAULT_MAX_CANDIDATES;
    try {
      const conditions = [];
      const params = [];
      if (options.project) {
        conditions.push("o.project = ?");
        params.push(options.project);
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const sql = `
        SELECT e.observation_id, CAST(e.embedding AS BLOB) as embedding,
               o.title, o.text, o.type, o.project, o.created_at, o.created_at_epoch
        FROM observation_embeddings e
        JOIN observations o ON o.id = e.observation_id
        ${whereClause}
        ORDER BY o.created_at_epoch DESC
        LIMIT ?
      `;
      params.push(maxCandidates);
      const rows = db.query(sql).all(...params);
      const scored = [];
      for (const row of rows) {
        try {
          if (!row.embedding) continue;
          const embedding = bufferToFloat32(row.embedding);
          if (embedding.length === 0) continue;
          const similarity = cosineSimilarity(queryEmbedding, embedding);
          if (similarity >= threshold) {
            scored.push({
              id: row.observation_id,
              observationId: row.observation_id,
              similarity,
              title: row.title,
              text: row.text,
              type: row.type,
              project: row.project,
              created_at: row.created_at,
              created_at_epoch: row.created_at_epoch
            });
          }
        } catch {
        }
      }
      scored.sort((a, b) => b.similarity - a.similarity);
      logger.debug("VECTOR", `Search: ${rows.length} candidates \u2192 ${scored.length} above threshold \u2192 ${Math.min(scored.length, limit)} results`);
      return scored.slice(0, limit);
    } catch (error) {
      logger.error("VECTOR", `Vector search error: ${error}`);
      return [];
    }
  }
  /**
   * Store embedding for an observation.
   */
  async storeEmbedding(db, observationId, embedding, model) {
    try {
      const blob = float32ToBuffer(embedding);
      db.query(`
        INSERT OR REPLACE INTO observation_embeddings
          (observation_id, embedding, model, dimensions, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        observationId,
        blob,
        model,
        embedding.length,
        (/* @__PURE__ */ new Date()).toISOString()
      );
      logger.debug("VECTOR", `Embedding saved for observation ${observationId}`);
    } catch (error) {
      logger.error("VECTOR", `Error saving embedding: ${error}`);
    }
  }
  /**
   * Generate embeddings for observations that don't have them yet.
   */
  async backfillEmbeddings(db, batchSize = 50) {
    const embeddingService2 = getEmbeddingService();
    if (!await embeddingService2.initialize()) {
      logger.warn("VECTOR", "Embedding service not available, backfill skipped");
      return 0;
    }
    const rows = db.query(`
      SELECT o.id, o.title, o.text, o.narrative, o.concepts
      FROM observations o
      LEFT JOIN observation_embeddings e ON e.observation_id = o.id
      WHERE e.observation_id IS NULL
      ORDER BY o.created_at_epoch DESC
      LIMIT ?
    `).all(batchSize);
    if (rows.length === 0) return 0;
    let count = 0;
    const model = embeddingService2.getModelName();
    for (const row of rows) {
      const parts = [row.title];
      if (row.text) parts.push(row.text);
      if (row.narrative) parts.push(row.narrative);
      if (row.concepts) parts.push(row.concepts);
      const fullText = parts.join(" ").substring(0, 2e3);
      const embedding = await embeddingService2.embed(fullText);
      if (embedding) {
        await this.storeEmbedding(db, row.id, embedding, model);
        count++;
      }
    }
    logger.info("VECTOR", `Backfill completed: ${count}/${rows.length} embeddings generated`);
    return count;
  }
  /**
   * Embedding statistics.
   */
  getStats(db) {
    try {
      const totalRow = db.query("SELECT COUNT(*) as count FROM observations").get();
      const embeddedRow = db.query("SELECT COUNT(*) as count FROM observation_embeddings").get();
      const total = totalRow?.count || 0;
      const embedded = embeddedRow?.count || 0;
      const percentage = total > 0 ? Math.round(embedded / total * 100) : 0;
      return { total, embedded, percentage };
    } catch {
      return { total: 0, embedded: 0, percentage: 0 };
    }
  }
};
var vectorSearch = null;
function getVectorSearch() {
  if (!vectorSearch) {
    vectorSearch = new VectorSearch();
  }
  return vectorSearch;
}

// src/services/search/ScoringEngine.ts
var SEARCH_WEIGHTS = {
  semantic: 0.4,
  fts5: 0.3,
  recency: 0.2,
  projectMatch: 0.1
};
var CONTEXT_WEIGHTS = {
  semantic: 0,
  fts5: 0,
  recency: 0.7,
  projectMatch: 0.3
};
function recencyScore(createdAtEpoch, halfLifeHours = 168) {
  if (!createdAtEpoch || createdAtEpoch <= 0) return 0;
  const nowMs = Date.now();
  const ageMs = nowMs - createdAtEpoch;
  if (ageMs <= 0) return 1;
  const ageHours = ageMs / (1e3 * 60 * 60);
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}
function normalizeFTS5Rank(rank, allRanks) {
  if (allRanks.length === 0) return 0;
  if (allRanks.length === 1) return 1;
  const minRank = Math.min(...allRanks);
  const maxRank = Math.max(...allRanks);
  if (minRank === maxRank) return 1;
  return (maxRank - rank) / (maxRank - minRank);
}
function projectMatchScore(itemProject, targetProject) {
  if (!itemProject || !targetProject) return 0;
  return itemProject.toLowerCase() === targetProject.toLowerCase() ? 1 : 0;
}
function computeCompositeScore(signals, weights) {
  return signals.semantic * weights.semantic + signals.fts5 * weights.fts5 + signals.recency * weights.recency + signals.projectMatch * weights.projectMatch;
}
var KNOWLEDGE_TYPE_BOOST = {
  constraint: 1.3,
  decision: 1.25,
  heuristic: 1.15,
  rejected: 1.1
};
function knowledgeTypeBoost(type) {
  return KNOWLEDGE_TYPE_BOOST[type] ?? 1;
}

// src/services/search/HybridSearch.ts
var HybridSearch = class {
  embeddingInitialized = false;
  /**
   * Initialize the embedding service (lazy, non-blocking)
   */
  async initialize() {
    try {
      const embeddingService2 = getEmbeddingService();
      await embeddingService2.initialize();
      this.embeddingInitialized = embeddingService2.isAvailable();
      logger.info("SEARCH", `HybridSearch initialized (embedding: ${this.embeddingInitialized ? "active" : "disabled"})`);
    } catch (error) {
      logger.warn("SEARCH", "Embedding initialization failed, using only FTS5", {}, error);
      this.embeddingInitialized = false;
    }
  }
  /**
   * Hybrid search with 4-signal scoring
   */
  async search(db, query, options = {}) {
    const limit = options.limit || 10;
    const weights = options.weights || SEARCH_WEIGHTS;
    const targetProject = options.project || "";
    const rawItems = /* @__PURE__ */ new Map();
    if (this.embeddingInitialized) {
      try {
        const embeddingService2 = getEmbeddingService();
        const queryEmbedding = await embeddingService2.embed(query);
        if (queryEmbedding) {
          const vectorSearch2 = getVectorSearch();
          const vectorResults = await vectorSearch2.search(db, queryEmbedding, {
            project: options.project,
            limit: limit * 2,
            // Fetch more results for ranking
            threshold: 0.3
          });
          for (const hit of vectorResults) {
            rawItems.set(String(hit.observationId), {
              id: String(hit.observationId),
              title: hit.title,
              content: hit.text || "",
              type: hit.type,
              project: hit.project,
              created_at: hit.created_at,
              created_at_epoch: hit.created_at_epoch,
              semanticScore: hit.similarity,
              fts5Rank: null,
              source: "vector"
            });
          }
          logger.debug("SEARCH", `Vector search: ${vectorResults.length} results`);
        }
      } catch (error) {
        logger.warn("SEARCH", "Vector search failed, using only keyword", {}, error);
      }
    }
    try {
      const { searchObservationsFTSWithRank: searchObservationsFTSWithRank2 } = await Promise.resolve().then(() => (init_Search(), Search_exports));
      const keywordResults = searchObservationsFTSWithRank2(db, query, {
        project: options.project,
        limit: limit * 2
      });
      for (const obs of keywordResults) {
        const id = String(obs.id);
        const existing = rawItems.get(id);
        if (existing) {
          existing.fts5Rank = obs.fts5_rank;
          existing.source = "vector";
        } else {
          rawItems.set(id, {
            id,
            title: obs.title,
            content: obs.text || obs.narrative || "",
            type: obs.type,
            project: obs.project,
            created_at: obs.created_at,
            created_at_epoch: obs.created_at_epoch,
            semanticScore: 0,
            fts5Rank: obs.fts5_rank,
            source: "keyword"
          });
        }
      }
      logger.debug("SEARCH", `Keyword search: ${keywordResults.length} results`);
    } catch (error) {
      logger.error("SEARCH", "Keyword search failed", {}, error);
    }
    if (rawItems.size === 0) return [];
    const allFTS5Ranks = Array.from(rawItems.values()).filter((item) => item.fts5Rank !== null).map((item) => item.fts5Rank);
    const scored = [];
    for (const item of rawItems.values()) {
      const signals = {
        semantic: item.semanticScore,
        fts5: item.fts5Rank !== null ? normalizeFTS5Rank(item.fts5Rank, allFTS5Ranks) : 0,
        recency: recencyScore(item.created_at_epoch),
        projectMatch: targetProject ? projectMatchScore(item.project, targetProject) : 0
      };
      const score = computeCompositeScore(signals, weights);
      const isHybrid = item.semanticScore > 0 && item.fts5Rank !== null;
      const hybridBoost = isHybrid ? 1.15 : 1;
      const finalScore = Math.min(1, score * hybridBoost * knowledgeTypeBoost(item.type));
      scored.push({
        id: item.id,
        title: item.title,
        content: item.content,
        type: item.type,
        project: item.project,
        created_at: item.created_at,
        created_at_epoch: item.created_at_epoch,
        score: finalScore,
        source: isHybrid ? "hybrid" : item.source,
        signals
      });
    }
    scored.sort((a, b) => b.score - a.score);
    const finalResults = scored.slice(0, limit);
    if (finalResults.length > 0) {
      try {
        const { updateLastAccessed: updateLastAccessed3 } = await Promise.resolve().then(() => (init_Observations(), Observations_exports));
        const ids = finalResults.map((r) => parseInt(r.id, 10)).filter((id) => id > 0);
        if (ids.length > 0) {
          updateLastAccessed3(db, ids);
        }
      } catch {
      }
    }
    return finalResults;
  }
};
var hybridSearch = null;
function getHybridSearch() {
  if (!hybridSearch) {
    hybridSearch = new HybridSearch();
  }
  return hybridSearch;
}

// src/sdk/index.ts
var TotalRecallSDK = class {
  db;
  project;
  constructor(config = {}) {
    this.db = new TotalRecallDatabase(config.dataDir, config.skipMigrations || false);
    this.project = config.project || this.detectProject();
  }
  detectProject() {
    try {
      const { execSync } = __require("child_process");
      const gitRoot = execSync("git rev-parse --show-toplevel", {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"]
      }).trim();
      return gitRoot.split("/").pop() || "default";
    } catch {
      return "default";
    }
  }
  /**
   * Get context for the current project
   */
  async getContext() {
    return {
      project: this.project,
      relevantObservations: getObservationsByProject(this.db.db, this.project, 20),
      relevantSummaries: getSummariesByProject(this.db.db, this.project, 5),
      recentPrompts: getPromptsByProject(this.db.db, this.project, 10)
    };
  }
  /**
   * Validate input for storeObservation
   */
  validateObservationInput(data) {
    if (!data.type || typeof data.type !== "string" || data.type.length > 100) {
      throw new Error("type is required (string, max 100 chars)");
    }
    if (!data.title || typeof data.title !== "string" || data.title.length > 500) {
      throw new Error("title is required (string, max 500 chars)");
    }
    if (!data.content || typeof data.content !== "string" || data.content.length > 1e5) {
      throw new Error("content is required (string, max 100KB)");
    }
  }
  /**
   * Validate input for storeSummary
   */
  validateSummaryInput(data) {
    const MAX = 5e4;
    for (const [key, val] of Object.entries(data)) {
      if (val !== void 0 && val !== null) {
        if (typeof val !== "string") throw new Error(`${key} must be a string`);
        if (val.length > MAX) throw new Error(`${key} too large (max 50KB)`);
      }
    }
  }
  /**
   * Generate and store embedding for an observation (fire-and-forget, non-blocking)
   */
  async generateEmbeddingAsync(observationId, title, content, concepts) {
    try {
      const embeddingService2 = getEmbeddingService();
      if (!embeddingService2.isAvailable()) return;
      const parts = [title, content];
      if (concepts?.length) parts.push(concepts.join(", "));
      const fullText = parts.join(" ").substring(0, 2e3);
      const embedding = await embeddingService2.embed(fullText);
      if (embedding) {
        const vectorSearch2 = getVectorSearch();
        await vectorSearch2.storeEmbedding(
          this.db.db,
          observationId,
          embedding,
          embeddingService2.getProvider() || "unknown"
        );
      }
    } catch (error) {
      logger.debug("SDK", `Embedding generation failed for obs ${observationId}: ${error}`);
    }
  }
  /**
   * Generate SHA256 content hash for content-based deduplication.
   * Uses (project + type + title + narrative) as semantic identity tuple.
   * Does NOT include sessionId since it's unique per invocation.
   */
  generateContentHash(type, title, narrative) {
    const payload = `${this.project}|${type}|${title}|${narrative || ""}`;
    return createHash("sha256").update(payload).digest("hex");
  }
  /**
   * Deduplication windows per type (ms).
   * Types with many repetitions have wider windows.
   */
  getDeduplicationWindow(type) {
    switch (type) {
      case "file-read":
        return 6e4;
      // 60s — frequent reads on the same files
      case "file-write":
        return 1e4;
      // 10s — rapid consecutive writes
      case "command":
        return 3e4;
      // 30s — standard
      case "research":
        return 12e4;
      // 120s — repeated web search and fetch
      case "delegation":
        return 6e4;
      // 60s — rapid delegations
      default:
        return 3e4;
    }
  }
  /**
   * Store a new observation
   */
  async storeObservation(data) {
    this.validateObservationInput(data);
    const sessionId = "sdk-" + Date.now();
    const contentHash = this.generateContentHash(data.type, data.title, data.narrative);
    const dedupWindow = this.getDeduplicationWindow(data.type);
    if (isDuplicateObservation(this.db.db, contentHash, dedupWindow)) {
      logger.debug("SDK", `Duplicate observation discarded (${data.type}, ${dedupWindow}ms): ${data.title}`);
      return -1;
    }
    const filesRead = data.filesRead || (data.type === "file-read" ? data.files : void 0);
    const filesModified = data.filesModified || (data.type === "file-write" ? data.files : void 0);
    const discoveryTokens = Math.ceil(data.content.length / 4);
    const observationId = createObservation(
      this.db.db,
      sessionId,
      this.project,
      data.type,
      data.title,
      data.subtitle || null,
      data.content,
      data.narrative || null,
      data.facts || null,
      data.concepts?.join(", ") || null,
      filesRead?.join(", ") || null,
      filesModified?.join(", ") || null,
      0,
      contentHash,
      discoveryTokens
    );
    this.generateEmbeddingAsync(observationId, data.title, data.content, data.concepts).catch(() => {
    });
    return observationId;
  }
  /**
   * Store structured knowledge (constraint, decision, heuristic, rejected).
   * Uses the `type` field for knowledgeType and `facts` for JSON metadata.
   */
  async storeKnowledge(data) {
    if (!KNOWLEDGE_TYPES.includes(data.knowledgeType)) {
      throw new Error(`Invalid knowledgeType: ${data.knowledgeType}. Allowed values: ${KNOWLEDGE_TYPES.join(", ")}`);
    }
    this.validateObservationInput({ type: data.knowledgeType, title: data.title, content: data.content });
    const metadata = (() => {
      switch (data.knowledgeType) {
        case "constraint":
          return {
            knowledgeType: "constraint",
            severity: data.metadata?.severity || "soft",
            reason: data.metadata?.reason
          };
        case "decision":
          return {
            knowledgeType: "decision",
            alternatives: data.metadata?.alternatives,
            reason: data.metadata?.reason
          };
        case "heuristic":
          return {
            knowledgeType: "heuristic",
            context: data.metadata?.context,
            confidence: data.metadata?.confidence
          };
        case "rejected":
          return {
            knowledgeType: "rejected",
            reason: data.metadata?.reason || "",
            alternatives: data.metadata?.alternatives
          };
      }
    })();
    const sessionId = "sdk-" + Date.now();
    const contentHash = this.generateContentHash(data.knowledgeType, data.title);
    if (isDuplicateObservation(this.db.db, contentHash)) {
      logger.debug("SDK", `Duplicate knowledge discarded: ${data.title}`);
      return -1;
    }
    const discoveryTokens = Math.ceil(data.content.length / 4);
    const observationId = createObservation(
      this.db.db,
      sessionId,
      data.project || this.project,
      data.knowledgeType,
      // type = knowledgeType
      data.title,
      null,
      // subtitle
      data.content,
      null,
      // narrative
      JSON.stringify(metadata),
      // facts = JSON metadata
      data.concepts?.join(", ") || null,
      data.files?.join(", ") || null,
      null,
      // filesModified: knowledge doesn't modify files
      0,
      // prompt_number
      contentHash,
      discoveryTokens
    );
    this.generateEmbeddingAsync(observationId, data.title, data.content, data.concepts).catch(() => {
    });
    return observationId;
  }
  /**
   * Store a session summary
   */
  async storeSummary(data) {
    this.validateSummaryInput(data);
    return createSummary(
      this.db.db,
      "sdk-" + Date.now(),
      this.project,
      data.request || null,
      data.investigated || null,
      data.learned || null,
      data.completed || null,
      data.nextSteps || null,
      data.notes || null
    );
  }
  /**
   * Search across all stored context
   */
  async search(query) {
    return {
      observations: searchObservations(this.db.db, query, this.project),
      summaries: searchSummaries(this.db.db, query, this.project)
    };
  }
  /**
   * Get recent observations
   */
  async getRecentObservations(limit = 10) {
    return getObservationsByProject(this.db.db, this.project, limit);
  }
  /**
   * Get recent summaries
   */
  async getRecentSummaries(limit = 5) {
    return getSummariesByProject(this.db.db, this.project, limit);
  }
  /**
   * Advanced search with FTS5 and filters
   */
  async searchAdvanced(query, filters = {}) {
    const projectFilters = { ...filters, project: filters.project || this.project };
    return {
      observations: searchObservationsFTS(this.db.db, query, projectFilters),
      summaries: searchSummariesFiltered(this.db.db, query, projectFilters)
    };
  }
  /**
   * Retrieve observations by ID (batch)
   */
  async getObservationsByIds(ids) {
    return getObservationsByIds(this.db.db, ids);
  }
  /**
   * Timeline: chronological context around an observation
   */
  async getTimeline(anchorId, depthBefore = 5, depthAfter = 5) {
    return getTimeline(this.db.db, anchorId, depthBefore, depthAfter);
  }
  /**
   * Create or retrieve a session for the current project
   */
  async getOrCreateSession(contentSessionId) {
    let session = getSessionByContentId(this.db.db, contentSessionId);
    if (!session) {
      const id = createSession(this.db.db, contentSessionId, this.project, "");
      session = {
        id,
        content_session_id: contentSessionId,
        project: this.project,
        user_prompt: "",
        memory_session_id: null,
        status: "active",
        started_at: (/* @__PURE__ */ new Date()).toISOString(),
        started_at_epoch: Date.now(),
        completed_at: null,
        completed_at_epoch: null
      };
    }
    return session;
  }
  /**
   * Store a user prompt
   */
  async storePrompt(contentSessionId, promptNumber, text) {
    await this.getOrCreateSession(contentSessionId);
    updateSessionUserPrompt(this.db.db, contentSessionId, text);
    return createPrompt(this.db.db, contentSessionId, this.project, promptNumber, text);
  }
  /**
   * Salva un messaggio conversazionale della sessione.
   */
  async storeConversationMessage(data) {
    await this.getOrCreateSession(data.contentSessionId);
    return createConversationMessage(
      this.db.db,
      data.contentSessionId,
      this.project,
      data.role,
      data.messageIndex,
      data.content,
      data.createdAt,
      data.createdAtEpoch
    );
  }
  /**
   * Restituisce il thread completo di una sessione.
   */
  async getConversationMessages(contentSessionId) {
    return getConversationMessagesBySession(this.db.db, contentSessionId);
  }
  /**
   * Importa un transcript salvando solo i turni user/assistant/system testuali.
   */
  async importConversationTranscript(contentSessionId, transcriptPath) {
    const { readFileSync: readFileSync2 } = await import("fs");
    const raw = readFileSync2(transcriptPath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    let messageIndex = getConversationMessageCountBySession(this.db.db, contentSessionId);
    let inserted = 0;
    for (const line of lines) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const role = row?.message?.role;
      if (role !== "user" && role !== "assistant" && role !== "system") continue;
      const content = this.extractTranscriptContent(row?.message?.content);
      if (!content) continue;
      const id = await this.storeConversationMessage({
        contentSessionId,
        role,
        messageIndex,
        content,
        createdAt: row.timestamp,
        createdAtEpoch: row.timestamp ? new Date(row.timestamp).getTime() : void 0
      });
      if (id > 0) {
        inserted += 1;
        if (role === "user" && messageIndex === 0) {
          updateSessionUserPrompt(this.db.db, contentSessionId, content);
        }
      }
      messageIndex += 1;
    }
    return inserted;
  }
  extractTranscriptContent(content) {
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";
    const parts = content.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      if (item.type === "text" && typeof item.text === "string") return [item.text.trim()];
      return [];
    }).filter(Boolean);
    return parts.join("\n\n").trim();
  }
  /**
   * Complete a session
   */
  async completeSession(sessionId) {
    completeSession(this.db.db, sessionId);
  }
  /**
   * Getter for current project name
   */
  getProject() {
    return this.project;
  }
  /**
   * Hybrid search: vector search + keyword FTS5
   * Requires HybridSearch initialization (embedding service)
   */
  async hybridSearch(query, options = {}) {
    const hybridSearch2 = getHybridSearch();
    return hybridSearch2.search(this.db.db, query, {
      project: this.project,
      limit: options.limit || 10
    });
  }
  /**
   * Semantic-only search (vector search)
   * Returns results based on cosine similarity with embeddings
   */
  async semanticSearch(query, options = {}) {
    const embeddingService2 = getEmbeddingService();
    if (!embeddingService2.isAvailable()) {
      await embeddingService2.initialize();
    }
    if (!embeddingService2.isAvailable()) return [];
    const queryEmbedding = await embeddingService2.embed(query);
    if (!queryEmbedding) return [];
    const vectorSearch2 = getVectorSearch();
    const results = await vectorSearch2.search(this.db.db, queryEmbedding, {
      project: this.project,
      limit: options.limit || 10,
      threshold: options.threshold || 0.3
    });
    return results.map((r) => ({
      id: String(r.observationId),
      title: r.title,
      content: r.text || "",
      type: r.type,
      project: r.project,
      created_at: r.created_at,
      created_at_epoch: r.created_at_epoch,
      score: r.similarity,
      source: "vector",
      signals: {
        semantic: r.similarity,
        fts5: 0,
        recency: recencyScore(r.created_at_epoch),
        projectMatch: projectMatchScore(r.project, this.project)
      }
    }));
  }
  /**
   * Generate embeddings for observations that don't have them yet
   */
  async backfillEmbeddings(batchSize = 50) {
    const vectorSearch2 = getVectorSearch();
    return vectorSearch2.backfillEmbeddings(this.db.db, batchSize);
  }
  /**
   * Embedding statistics in the database
   */
  getEmbeddingStats() {
    const vectorSearch2 = getVectorSearch();
    return vectorSearch2.getStats(this.db.db);
  }
  /**
   * Initialize the embedding service (lazy, call before hybridSearch)
   */
  async initializeEmbeddings() {
    const hybridSearch2 = getHybridSearch();
    await hybridSearch2.initialize();
    return getEmbeddingService().isAvailable();
  }
  /**
   * Smart context with 4-signal ranking and token budget.
   *
   * If query present: uses HybridSearch with SEARCH_WEIGHTS.
   * If no query: ranking by recency + project match (CONTEXT_WEIGHTS).
   */
  async getSmartContext(options = {}) {
    const tokenBudget = options.tokenBudget || parseInt(process.env.TOTALRECALL_CONTEXT_TOKENS || "0", 10) || 2e3;
    const summaries = getSummariesByProject(this.db.db, this.project, 5);
    let items;
    if (options.query) {
      const hybridSearch2 = getHybridSearch();
      const results = await hybridSearch2.search(this.db.db, options.query, {
        project: this.project,
        limit: 30
      });
      items = results.map((r) => ({
        id: parseInt(r.id, 10) || 0,
        title: r.title,
        content: r.content,
        type: r.type,
        project: r.project,
        created_at: r.created_at,
        created_at_epoch: r.created_at_epoch,
        score: r.score,
        signals: r.signals
      }));
    } else {
      const observations = getObservationsByProject(this.db.db, this.project, 30);
      const knowledgeTypes = new Set(KNOWLEDGE_TYPES);
      const knowledgeObs = [];
      const normalObs = [];
      for (const obs of observations) {
        if (knowledgeTypes.has(obs.type)) knowledgeObs.push(obs);
        else normalObs.push(obs);
      }
      const scoreObs = (obs) => {
        const signals = {
          semantic: 0,
          fts5: 0,
          recency: recencyScore(obs.created_at_epoch),
          projectMatch: projectMatchScore(obs.project, this.project)
        };
        const baseScore = computeCompositeScore(signals, CONTEXT_WEIGHTS);
        return {
          id: obs.id,
          title: obs.title,
          content: obs.text || obs.narrative || "",
          type: obs.type,
          project: obs.project,
          created_at: obs.created_at,
          created_at_epoch: obs.created_at_epoch,
          score: Math.min(1, baseScore * knowledgeTypeBoost(obs.type)),
          signals
        };
      };
      const scoredKnowledge = knowledgeObs.map(scoreObs).sort((a, b) => b.score - a.score);
      const scoredNormal = normalObs.map(scoreObs).sort((a, b) => b.score - a.score);
      items = [...scoredKnowledge, ...scoredNormal];
    }
    let tokensUsed = 0;
    const budgetItems = [];
    for (const item of items) {
      const itemTokens = Math.ceil((item.title.length + item.content.length) / 4);
      if (tokensUsed + itemTokens > tokenBudget) break;
      tokensUsed += itemTokens;
      budgetItems.push(item);
    }
    items = budgetItems;
    return {
      project: this.project,
      items,
      summaries,
      tokenBudget,
      tokensUsed: Math.min(tokensUsed, tokenBudget)
    };
  }
  /**
   * Detect stale observations (files modified after creation) and mark them in DB.
   * Returns the number of observations marked as stale.
   */
  async detectStaleObservations() {
    const staleObs = getStaleObservations(this.db.db, this.project);
    if (staleObs.length > 0) {
      const ids = staleObs.map((o) => o.id);
      markObservationsStale(this.db.db, ids, true);
    }
    return staleObs.length;
  }
  /**
   * Consolidate duplicate observations on the same file and type.
   * Groups by (project, type, files_modified), keeps the most recent.
   */
  async consolidateObservations(options = {}) {
    return consolidateObservations(this.db.db, this.project, options);
  }
  /**
   * Decay statistics: total, stale, never accessed, recently accessed.
   */
  async getDecayStats() {
    const total = this.db.db.query(
      "SELECT COUNT(*) as count FROM observations WHERE project = ?"
    ).get(this.project)?.count || 0;
    const stale = this.db.db.query(
      "SELECT COUNT(*) as count FROM observations WHERE project = ? AND is_stale = 1"
    ).get(this.project)?.count || 0;
    const neverAccessed = this.db.db.query(
      "SELECT COUNT(*) as count FROM observations WHERE project = ? AND last_accessed_epoch IS NULL"
    ).get(this.project)?.count || 0;
    const recentThreshold = Date.now() - 48 * 60 * 60 * 1e3;
    const recentlyAccessed = this.db.db.query(
      "SELECT COUNT(*) as count FROM observations WHERE project = ? AND last_accessed_epoch > ?"
    ).get(this.project, recentThreshold)?.count || 0;
    return { total, stale, neverAccessed, recentlyAccessed };
  }
  /**
   * Create a structured checkpoint for session resume.
   * Automatically saves a context_snapshot with the last 10 observations.
   */
  async createCheckpoint(sessionId, data) {
    const recentObs = getObservationsByProject(this.db.db, this.project, 10);
    const contextSnapshot = JSON.stringify(
      recentObs.map((o) => ({ id: o.id, type: o.type, title: o.title, text: o.text?.substring(0, 200) }))
    );
    return createCheckpoint(this.db.db, sessionId, this.project, {
      task: data.task,
      progress: data.progress,
      nextSteps: data.nextSteps,
      openQuestions: data.openQuestions,
      relevantFiles: data.relevantFiles?.join(", "),
      contextSnapshot
    });
  }
  /**
   * Retrieve the latest checkpoint of a specific session.
   */
  async getCheckpoint(sessionId) {
    return getLatestCheckpoint(this.db.db, sessionId);
  }
  /**
   * Retrieve the latest checkpoint for the current project.
   * Useful for automatic resume without specifying session ID.
   */
  async getLatestProjectCheckpoint() {
    return getLatestCheckpointByProject(this.db.db, this.project);
  }
  /**
   * Generate an activity report for the current project.
   * Aggregates observations, sessions, summaries and files for a time period.
   */
  async generateReport(options) {
    const now = /* @__PURE__ */ new Date();
    let startEpoch;
    let endEpoch = now.getTime();
    if (options?.startDate && options?.endDate) {
      startEpoch = options.startDate.getTime();
      endEpoch = options.endDate.getTime();
    } else {
      const period = options?.period || "weekly";
      const daysBack = period === "monthly" ? 30 : 7;
      startEpoch = endEpoch - daysBack * 24 * 60 * 60 * 1e3;
    }
    return getReportData(this.db.db, this.project, startEpoch, endEpoch);
  }
  /**
   * Lista osservazioni con keyset pagination.
   * Restituisce un oggetto { data, next_cursor, has_more }.
   *
   * Esempio:
   *   const page1 = await sdk.listObservations({ limit: 50 });
   *   const page2 = await sdk.listObservations({ cursor: page1.next_cursor });
   */
  async listObservations(options = {}) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const project = options.project ?? this.project;
    let rows;
    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (!decoded) throw new Error("Cursor non valido");
      const sql = project ? `SELECT * FROM observations
           WHERE project = ? AND (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
           ORDER BY created_at_epoch DESC, id DESC
           LIMIT ?` : `SELECT * FROM observations
           WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
           ORDER BY created_at_epoch DESC, id DESC
           LIMIT ?`;
      rows = project ? this.db.db.query(sql).all(project, decoded.epoch, decoded.epoch, decoded.id, limit) : this.db.db.query(sql).all(decoded.epoch, decoded.epoch, decoded.id, limit);
    } else {
      const sql = project ? "SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?" : "SELECT * FROM observations ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
      rows = project ? this.db.db.query(sql).all(project, limit) : this.db.db.query(sql).all(limit);
    }
    const next_cursor = rows.length >= limit ? encodeCursor(rows[rows.length - 1].id, rows[rows.length - 1].created_at_epoch) : null;
    return { data: rows, next_cursor, has_more: next_cursor !== null };
  }
  /**
   * Lista sommari con keyset pagination.
   * Restituisce un oggetto { data, next_cursor, has_more }.
   *
   * Esempio:
   *   const page1 = await sdk.listSummaries({ limit: 20 });
   *   const page2 = await sdk.listSummaries({ cursor: page1.next_cursor });
   */
  async listSummaries(options = {}) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 200);
    const project = options.project ?? this.project;
    let rows;
    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (!decoded) throw new Error("Cursor non valido");
      const sql = project ? `SELECT * FROM summaries
           WHERE project = ? AND (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
           ORDER BY created_at_epoch DESC, id DESC
           LIMIT ?` : `SELECT * FROM summaries
           WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
           ORDER BY created_at_epoch DESC, id DESC
           LIMIT ?`;
      rows = project ? this.db.db.query(sql).all(project, decoded.epoch, decoded.epoch, decoded.id, limit) : this.db.db.query(sql).all(decoded.epoch, decoded.epoch, decoded.id, limit);
    } else {
      const sql = project ? "SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?" : "SELECT * FROM summaries ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
      rows = project ? this.db.db.query(sql).all(project, limit) : this.db.db.query(sql).all(limit);
    }
    const next_cursor = rows.length >= limit ? encodeCursor(rows[rows.length - 1].id, rows[rows.length - 1].created_at_epoch) : null;
    return { data: rows, next_cursor, has_more: next_cursor !== null };
  }
  /**
   * Getter for direct database access (for API routes)
   */
  getDb() {
    return this.db.db;
  }
  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
};
function createTotalRecall(config) {
  return new TotalRecallSDK(config);
}
export {
  KNOWLEDGE_TYPES,
  TotalRecallSDK,
  createTotalRecall
};
