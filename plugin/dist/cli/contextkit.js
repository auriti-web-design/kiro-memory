#!/usr/bin/env node
import { createRequire } from 'module';const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

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
function resolveDbPath() {
  if (existsSync(join(DATA_DIR, "totalrecall.db"))) return join(DATA_DIR, "totalrecall.db");
  if (existsSync(_legacyDbV3)) return _legacyDbV3;
  if (existsSync(_legacyDbV1)) return _legacyDbV1;
  return join(DATA_DIR, "totalrecall.db");
}
function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}
var _dirname, _legacyV1Dir, _canonicalDir, DATA_DIR, KIRO_CONFIG_DIR, PLUGIN_ROOT, ARCHIVES_DIR, LOGS_DIR, TRASH_DIR, BACKUPS_DIR, MODES_DIR, USER_SETTINGS_PATH, _legacyDbV1, _legacyDbV3, DB_PATH, VECTOR_DB_DIR, OBSERVER_SESSIONS_DIR, KIRO_SETTINGS_PATH, KIRO_CONTEXT_PATH;
var init_paths = __esm({
  "src/shared/paths.ts"() {
    "use strict";
    _dirname = getDirname();
    _legacyV1Dir = join(homedir(), ".contextkit");
    _canonicalDir = join(homedir(), ".totalrecall");
    DATA_DIR = process.env.TOTALRECALL_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || resolveDataDir();
    KIRO_CONFIG_DIR = process.env.KIRO_CONFIG_DIR || join(homedir(), ".kiro");
    PLUGIN_ROOT = join(KIRO_CONFIG_DIR, "plugins", "totalrecall");
    ARCHIVES_DIR = join(DATA_DIR, "archives");
    LOGS_DIR = join(DATA_DIR, "logs");
    TRASH_DIR = join(DATA_DIR, "trash");
    BACKUPS_DIR = join(DATA_DIR, "backups");
    MODES_DIR = join(DATA_DIR, "modes");
    USER_SETTINGS_PATH = join(DATA_DIR, "settings.json");
    _legacyDbV1 = join(DATA_DIR, "contextkit.db");
    _legacyDbV3 = join(DATA_DIR, "totalrecall.db");
    DB_PATH = resolveDbPath();
    VECTOR_DB_DIR = join(DATA_DIR, "vector-db");
    OBSERVER_SESSIONS_DIR = join(DATA_DIR, "observer-sessions");
    KIRO_SETTINGS_PATH = join(KIRO_CONFIG_DIR, "settings.json");
    KIRO_CONTEXT_PATH = join(KIRO_CONFIG_DIR, "context.md");
  }
});

// src/utils/logger.ts
import { appendFileSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync } from "fs";
import { join as join2 } from "path";
var LogLevel, Logger, logger;
var init_logger = __esm({
  "src/utils/logger.ts"() {
    "use strict";
    init_paths();
    LogLevel = /* @__PURE__ */ ((LogLevel2) => {
      LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
      LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
      LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
      LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
      LogLevel2[LogLevel2["SILENT"] = 4] = "SILENT";
      return LogLevel2;
    })(LogLevel || {});
    Logger = class {
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
    logger = new Logger();
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
  const self2 = selfStmt.all(anchorId);
  const afterStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE (created_at_epoch > ? OR (created_at_epoch = ? AND id > ?))
    ORDER BY created_at_epoch ASC, id ASC
    LIMIT ?
  `);
  const after = afterStmt.all(anchorEpoch, anchorEpoch, anchorId, depthAfter);
  return [...before, ...self2, ...after];
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

// src/services/sqlite/ImportExport.ts
var ImportExport_exports = {};
__export(ImportExport_exports, {
  JSONL_SCHEMA_VERSION: () => JSONL_SCHEMA_VERSION,
  computeImportHash: () => computeImportHash,
  countExportRecords: () => countExportRecords,
  exportObservationsStreaming: () => exportObservationsStreaming,
  exportPromptsStreaming: () => exportPromptsStreaming,
  exportSummariesStreaming: () => exportSummariesStreaming,
  generateMetaRecord: () => generateMetaRecord,
  hashExistsInObservations: () => hashExistsInObservations,
  importJsonl: () => importJsonl,
  validateJsonlRow: () => validateJsonlRow
});
import { createHash } from "crypto";
function countExportRecords(db, filters) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const obsConds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });
  const sumConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  const promptConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  const obsCount = db.query(
    `SELECT COUNT(*) as c FROM observations WHERE ${obsConds.where}`
  ).get(...obsConds.params).c;
  const sumCount = db.query(
    `SELECT COUNT(*) as c FROM summaries WHERE ${sumConds.where}`
  ).get(...sumConds.params).c;
  const promptCount = db.query(
    `SELECT COUNT(*) as c FROM prompts WHERE ${promptConds.where}`
  ).get(...promptConds.params).c;
  return { observations: obsCount, summaries: sumCount, prompts: promptCount };
}
function generateMetaRecord(db, filters) {
  const counts = countExportRecords(db, filters);
  const meta = {
    _meta: {
      version: JSONL_SCHEMA_VERSION,
      exported_at: (/* @__PURE__ */ new Date()).toISOString(),
      counts,
      filters: Object.keys(filters).length > 0 ? filters : void 0
    }
  };
  return JSON.stringify(meta);
}
function exportObservationsStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
              files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
              created_at, created_at_epoch
       FROM observations
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "observation",
        id: row.id,
        memory_session_id: row.memory_session_id,
        project: row.project,
        type: row.type,
        title: row.title,
        subtitle: row.subtitle,
        text: row.text,
        narrative: row.narrative,
        facts: row.facts,
        concepts: row.concepts,
        files_read: row.files_read,
        files_modified: row.files_modified,
        prompt_number: row.prompt_number,
        content_hash: row.content_hash,
        discovery_tokens: row.discovery_tokens ?? 0,
        auto_category: row.auto_category,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function exportSummariesStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, session_id, project, request, investigated, learned, completed, next_steps, notes,
              discovery_tokens, created_at, created_at_epoch
       FROM summaries
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "summary",
        id: row.id,
        session_id: row.session_id,
        project: row.project,
        request: row.request,
        investigated: row.investigated,
        learned: row.learned,
        completed: row.completed,
        next_steps: row.next_steps,
        notes: row.notes,
        discovery_tokens: row.discovery_tokens ?? 0,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function exportPromptsStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch
       FROM prompts
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "prompt",
        id: row.id,
        content_session_id: row.content_session_id,
        project: row.project,
        prompt_number: row.prompt_number,
        prompt_text: row.prompt_text,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function validateJsonlRow(raw) {
  if (!raw || typeof raw !== "object") {
    return "Il record non \xE8 un oggetto JSON valido";
  }
  const rec = raw;
  if ("_meta" in rec) return null;
  const validTypes = ["observation", "summary", "prompt"];
  if (!rec._type || typeof rec._type !== "string" || !validTypes.includes(rec._type)) {
    return `Campo "_type" obbligatorio, uno di: ${validTypes.join(", ")}`;
  }
  if (rec._type === "observation") {
    if (!rec.project || typeof rec.project !== "string") return 'observation: campo "project" obbligatorio';
    if (!rec.type || typeof rec.type !== "string") return 'observation: campo "type" obbligatorio';
    if (!rec.title || typeof rec.title !== "string") return 'observation: campo "title" obbligatorio';
    if (rec.project.length > 200) return 'observation: "project" troppo lungo (max 200)';
    if (rec.title.length > 500) return 'observation: "title" troppo lungo (max 500)';
  } else if (rec._type === "summary") {
    if (!rec.project || typeof rec.project !== "string") return 'summary: campo "project" obbligatorio';
    if (!rec.session_id || typeof rec.session_id !== "string") return 'summary: campo "session_id" obbligatorio';
  } else if (rec._type === "prompt") {
    if (!rec.project || typeof rec.project !== "string") return 'prompt: campo "project" obbligatorio';
    if (!rec.content_session_id || typeof rec.content_session_id !== "string") return 'prompt: campo "content_session_id" obbligatorio';
    if (!rec.prompt_text || typeof rec.prompt_text !== "string") return 'prompt: campo "prompt_text" obbligatorio';
  }
  return null;
}
function computeImportHash(rec) {
  const payload = [
    rec.project ?? "",
    rec.type ?? "",
    rec.title ?? "",
    rec.narrative ?? ""
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
function hashExistsInObservations(db, hash) {
  const result = db.query(
    "SELECT id FROM observations WHERE content_hash = ? LIMIT 1"
  ).get(hash);
  return !!result;
}
function importObservationBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);
        if (hashExistsInObservations(db, hash)) {
          skipped++;
        } else {
          imported++;
        }
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);
        if (hashExistsInObservations(db, hash)) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO observations
           (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
            files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
            created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.memory_session_id || "imported",
            rec.project,
            rec.type,
            rec.title,
            rec.subtitle ?? null,
            rec.text ?? null,
            rec.narrative ?? null,
            rec.facts ?? null,
            rec.concepts ?? null,
            rec.files_read ?? null,
            rec.files_modified ?? null,
            rec.prompt_number ?? 0,
            hash,
            rec.discovery_tokens ?? 0,
            rec.auto_category ?? null,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importSummaryBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1"
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0);
        if (exists) skipped++;
        else imported++;
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1"
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0);
        if (exists) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO summaries
           (session_id, project, request, investigated, learned, completed, next_steps, notes,
            discovery_tokens, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.session_id,
            rec.project,
            rec.request ?? null,
            rec.investigated ?? null,
            rec.learned ?? null,
            rec.completed ?? null,
            rec.next_steps ?? null,
            rec.notes ?? null,
            rec.discovery_tokens ?? 0,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importPromptBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1"
        ).get(rec.content_session_id, rec.prompt_number ?? 0);
        if (exists) skipped++;
        else imported++;
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1"
        ).get(rec.content_session_id, rec.prompt_number ?? 0);
        if (exists) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO prompts
           (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            rec.content_session_id,
            rec.project,
            rec.prompt_number ?? 0,
            rec.prompt_text,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importJsonl(db, content, dryRun = false) {
  const lines = content.split("\n");
  const result = {
    imported: 0,
    skipped: 0,
    errors: 0,
    total: 0,
    errorDetails: []
  };
  const obsBuf = [];
  const sumBuf = [];
  const promptBuf = [];
  const flushBuffers = () => {
    if (obsBuf.length > 0) {
      const r = importObservationBatch(db, obsBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (sumBuf.length > 0) {
      const r = importSummaryBatch(db, sumBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (promptBuf.length > 0) {
      const r = importPromptBatch(db, promptBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;
    result.total++;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: `JSON non valido: ${raw.substring(0, 60)}` });
      continue;
    }
    if (parsed && typeof parsed === "object" && "_meta" in parsed) {
      result.total--;
      continue;
    }
    const validErr = validateJsonlRow(parsed);
    if (validErr) {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: validErr });
      continue;
    }
    const rec = parsed;
    if (rec._type === "observation") {
      obsBuf.push(rec);
    } else if (rec._type === "summary") {
      sumBuf.push(rec);
    } else if (rec._type === "prompt") {
      promptBuf.push(rec);
    }
    const totalBuf = obsBuf.length + sumBuf.length + promptBuf.length;
    if (totalBuf >= IMPORT_BATCH_SIZE) {
      flushBuffers();
    }
  }
  flushBuffers();
  return result;
}
function filtersToEpoch(filters) {
  return {
    fromEpoch: filters.from ? new Date(filters.from).getTime() : void 0,
    toEpoch: filters.to ? new Date(filters.to).getTime() : void 0
  };
}
function buildConditions(params) {
  const conditions = ["1=1"];
  const values = [];
  if (params.project) {
    conditions.push("project = ?");
    values.push(params.project);
  }
  if (params.type) {
    conditions.push("type = ?");
    values.push(params.type);
  }
  if (params.fromEpoch !== void 0) {
    conditions.push("created_at_epoch >= ?");
    values.push(params.fromEpoch);
  }
  if (params.toEpoch !== void 0) {
    conditions.push("created_at_epoch <= ?");
    values.push(params.toEpoch);
  }
  return { where: conditions.join(" AND "), params: values };
}
var JSONL_SCHEMA_VERSION, IMPORT_BATCH_SIZE;
var init_ImportExport = __esm({
  "src/services/sqlite/ImportExport.ts"() {
    "use strict";
    JSONL_SCHEMA_VERSION = "2.5.0";
    IMPORT_BATCH_SIZE = 100;
  }
});

// src/services/search/EmbeddingService.ts
var EmbeddingService_exports = {};
__export(EmbeddingService_exports, {
  EmbeddingService: () => EmbeddingService,
  getEmbeddingService: () => getEmbeddingService
});
function getEmbeddingService() {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}
var MODEL_CONFIGS, FASTEMBED_COMPATIBLE_MODELS, EmbeddingService, embeddingService;
var init_EmbeddingService = __esm({
  "src/services/search/EmbeddingService.ts"() {
    "use strict";
    init_logger();
    MODEL_CONFIGS = {
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
    FASTEMBED_COMPATIBLE_MODELS = /* @__PURE__ */ new Set(["all-MiniLM-L6-v2", "bge-small-en"]);
    EmbeddingService = class {
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
    embeddingService = null;
  }
});

// src/cli/cli-utils.ts
var cli_utils_exports = {};
__export(cli_utils_exports, {
  CONFIG_DEFAULTS: () => CONFIG_DEFAULTS,
  buildProgressBar: () => buildProgressBar,
  checkFtsIntegrity: () => checkFtsIntegrity,
  formatBytes: () => formatBytes,
  formatImportResult: () => formatImportResult,
  formatStatsOutput: () => formatStatsOutput,
  generateExportOutput: () => generateExportOutput,
  generateJsonOutput: () => generateJsonOutput,
  generateJsonlOutput: () => generateJsonlOutput,
  generateMarkdownOutput: () => generateMarkdownOutput,
  getConfigPath: () => getConfigPath,
  getConfigValue: () => getConfigValue,
  getDbFileSize: () => getDbFileSize,
  listConfig: () => listConfig,
  observationToJsonl: () => observationToJsonl,
  observationToMarkdown: () => observationToMarkdown,
  parseJsonlFile: () => parseJsonlFile,
  readConfig: () => readConfig,
  rebuildFtsIndex: () => rebuildFtsIndex,
  removeOrphanedEmbeddings: () => removeOrphanedEmbeddings,
  setConfigValue: () => setConfigValue,
  vacuumDatabase: () => vacuumDatabase,
  validateImportRecord: () => validateImportRecord,
  writeConfig: () => writeConfig
});
import { existsSync as existsSync5, statSync as statSync4, readFileSync as readFileSync3, writeFileSync as writeFileSync2, mkdirSync as mkdirSync4 } from "fs";
import { join as join4 } from "path";
function observationToJsonl(obs) {
  return JSON.stringify(obs);
}
function generateJsonlOutput(observations) {
  return observations.map(observationToJsonl).join("\n");
}
function generateJsonOutput(observations) {
  return JSON.stringify(observations, null, 2);
}
function observationToMarkdown(obs) {
  const date = new Date(obs.created_at).toLocaleDateString("it-IT", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const lines = [
    `## ${obs.title}`,
    "",
    `- **Tipo:** ${obs.type}`,
    `- **Progetto:** ${obs.project}`,
    `- **Data:** ${date}`
  ];
  if (obs.subtitle) lines.push(`- **Sottotitolo:** ${obs.subtitle}`);
  if (obs.files_modified) lines.push(`- **File modificati:** ${obs.files_modified}`);
  if (obs.files_read) lines.push(`- **File letti:** ${obs.files_read}`);
  if (obs.text) {
    lines.push("", "### Contenuto", "", obs.text);
  }
  if (obs.narrative) {
    lines.push("", "### Narrativa", "", obs.narrative);
  }
  if (obs.facts) {
    lines.push("", "### Fatti", "", obs.facts);
  }
  lines.push("");
  return lines.join("\n");
}
function generateMarkdownOutput(observations) {
  if (observations.length === 0) return "# Nessuna observation trovata\n";
  const header = [
    "# Total Recall \u2014 Export Observations",
    "",
    `> Progetto: ${observations[0].project} | Totale: ${observations.length}`,
    "",
    "---",
    ""
  ].join("\n");
  return header + observations.map(observationToMarkdown).join("\n---\n\n");
}
function generateExportOutput(observations, format) {
  switch (format) {
    case "jsonl":
      return generateJsonlOutput(observations);
    case "json":
      return generateJsonOutput(observations);
    case "md":
      return generateMarkdownOutput(observations);
  }
}
function validateImportRecord(raw) {
  if (!raw || typeof raw !== "object") {
    return "Record non \xE8 un oggetto JSON valido";
  }
  const rec = raw;
  if (!rec.project || typeof rec.project !== "string" || rec.project.trim() === "") {
    return 'Campo "project" obbligatorio (stringa non vuota)';
  }
  if (!rec.type || typeof rec.type !== "string" || rec.type.trim() === "") {
    return 'Campo "type" obbligatorio (stringa non vuota)';
  }
  if (!rec.title || typeof rec.title !== "string" || rec.title.trim() === "") {
    return 'Campo "title" obbligatorio (stringa non vuota)';
  }
  if (rec.project.length > 200) return '"project" troppo lungo (max 200 caratteri)';
  if (rec.type.length > 100) return '"type" troppo lungo (max 100 caratteri)';
  if (rec.title.length > 500) return '"title" troppo lungo (max 500 caratteri)';
  for (const field of ["subtitle", "text", "narrative", "facts", "concepts", "files_read", "files_modified", "content_hash"]) {
    const val = rec[field];
    if (val !== void 0 && val !== null && typeof val !== "string") {
      return `Campo "${field}" deve essere stringa o null`;
    }
  }
  return null;
}
function parseJsonlFile(content) {
  const lines = content.split("\n");
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      results.push({ line: i + 1, error: `JSON non valido: ${raw.substring(0, 50)}` });
      continue;
    }
    const validationError = validateImportRecord(parsed);
    if (validationError) {
      results.push({ line: i + 1, error: validationError });
      continue;
    }
    results.push({ line: i + 1, record: parsed });
  }
  return results;
}
function getConfigPath() {
  return join4(DATA_DIR, "config.json");
}
function readConfig(configPath) {
  const path = configPath || getConfigPath();
  if (!existsSync5(path)) return {};
  try {
    const raw = readFileSync3(path, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return {};
  } catch {
    return {};
  }
}
function writeConfig(config, configPath) {
  const path = configPath || getConfigPath();
  const dir = path.substring(0, path.lastIndexOf("/"));
  mkdirSync4(dir, { recursive: true });
  writeFileSync2(path, JSON.stringify(config, null, 2), "utf8");
}
function getConfigValue(key, configPath) {
  const config = readConfig(configPath);
  if (key in config) return config[key];
  if (key in CONFIG_DEFAULTS) return CONFIG_DEFAULTS[key];
  return null;
}
function setConfigValue(key, rawValue, configPath) {
  const config = readConfig(configPath);
  let value = rawValue;
  if (rawValue === "true") value = true;
  else if (rawValue === "false") value = false;
  else {
    const num = Number(rawValue);
    if (!isNaN(num) && rawValue.trim() !== "") value = num;
  }
  config[key] = value;
  writeConfig(config, configPath);
  return value;
}
function listConfig(configPath) {
  const config = readConfig(configPath);
  const merged = { ...CONFIG_DEFAULTS };
  for (const [k, v] of Object.entries(config)) {
    merged[k] = v;
  }
  return merged;
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function getDbFileSize(dbPath) {
  try {
    if (!existsSync5(dbPath)) return 0;
    return statSync4(dbPath).size;
  } catch {
    return 0;
  }
}
function formatStatsOutput(stats) {
  const lines = [
    "",
    "=== Total Recall \u2014 Statistiche Database ===",
    "",
    `  Observations totali:   ${stats.totalObservations}`,
    `  Sessioni totali:       ${stats.totalSessions}`,
    `  Progetti distinti:     ${stats.totalProjects}`,
    `  Dimensione DB:         ${formatBytes(stats.dbSizeBytes)}`
  ];
  if (stats.mostActiveProject) {
    lines.push(`  Progetto piu' attivo:  ${stats.mostActiveProject}`);
  }
  const coverage = stats.embeddingCoverage;
  const coverageBar = buildProgressBar(coverage, 20);
  lines.push(`  Copertura embeddings:  ${coverageBar} ${coverage}%`);
  lines.push("");
  return lines.join("\n");
}
function buildProgressBar(percent, width = 20) {
  const filled = Math.round(percent / 100 * width);
  const empty = width - filled;
  return `[${"#".repeat(filled)}${"-".repeat(empty)}]`;
}
function formatImportResult(result) {
  const prefix = result.dryRun ? "[DRY RUN] " : "";
  const lines = [
    "",
    `=== ${prefix}Total Recall \u2014 Import JSONL ===`,
    "",
    `  Record totali analizzati: ${result.total}`,
    `  Importati:                ${result.imported}`,
    `  Saltati (duplicati):      ${result.skipped}`,
    `  Errori di validazione:    ${result.errors}`
  ];
  if (result.dryRun) {
    lines.push("");
    lines.push("  (Dry run: nessun dato inserito. Rimuovi --dry-run per applicare.)");
  }
  if (result.errorDetails && result.errorDetails.length > 0) {
    lines.push("");
    lines.push("  Errori:");
    for (const err of result.errorDetails.slice(0, 20)) {
      lines.push(`    Riga ${err.line}: ${err.error}`);
    }
    if (result.errorDetails.length > 20) {
      lines.push(`    ... e altri ${result.errorDetails.length - 20} errori`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
function checkFtsIntegrity(db) {
  try {
    db.query("INSERT INTO observations_fts(observations_fts) VALUES('integrity-check')").run();
    return true;
  } catch {
    return false;
  }
}
function rebuildFtsIndex(db) {
  try {
    db.run("INSERT INTO observations_fts(observations_fts) VALUES('rebuild')");
    return true;
  } catch {
    return false;
  }
}
function removeOrphanedEmbeddings(db) {
  try {
    const result = db.run(
      `DELETE FROM observation_embeddings
       WHERE observation_id NOT IN (SELECT id FROM observations)`
    );
    return Number(result.changes);
  } catch {
    return 0;
  }
}
function vacuumDatabase(db) {
  try {
    db.run("VACUUM");
    return true;
  } catch {
    return false;
  }
}
var CONFIG_DEFAULTS;
var init_cli_utils = __esm({
  "src/cli/cli-utils.ts"() {
    "use strict";
    init_paths();
    CONFIG_DEFAULTS = {
      "worker.port": 3001,
      "worker.host": "127.0.0.1",
      "log.level": "INFO",
      "search.limit": 20,
      "embeddings.enabled": false,
      "decay.staleThresholdDays": 30,
      // Politiche di retention: età massima in giorni (0 = mai eliminare)
      "retention.observations.maxAgeDays": 90,
      "retention.summaries.maxAgeDays": 365,
      "retention.prompts.maxAgeDays": 30,
      "retention.knowledge.maxAgeDays": 0,
      // Cleanup automatico schedulato
      "retention.autoCleanupEnabled": true,
      "retention.autoCleanupIntervalHours": 24,
      // Backup automatico schedulato
      "backup.enabled": true,
      "backup.intervalHours": 24,
      "backup.maxKeep": 7,
      "backup.compress": false,
      // Multi-user authentication (disabled by default = single-user mode)
      "auth.enabled": false,
      "auth.jwt_secret": ""
    };
  }
});

// src/services/sqlite/adapters/claude-mem.ts
import { createHash as createHash4 } from "node:crypto";
function detectClaudeMemFormat(content) {
  if (!content || content.trim().length === 0) return false;
  const lines = content.split("\n");
  const sampleSize = Math.min(10, lines.length);
  let claudeMemLikeCount = 0;
  let validJsonCount = 0;
  for (let i = 0; i < lines.length && validJsonCount < sampleSize; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    validJsonCount++;
    const record = parsed;
    if ("_meta" in record) continue;
    if ("_type" in record) return false;
    const isClaudeMem = typeof record["id"] === "string" && record["id"].startsWith("mem_") || record["type"] === "memory" && typeof record["content"] === "string" || record["type"] === "summary" && typeof record["content"] === "string" || record["type"] === "prompt" && typeof record["content"] === "string" || typeof record["content"] === "string" && (record["source"] === "user" || record["source"] === "assistant") && typeof record["created_at"] === "string";
    if (isClaudeMem) claudeMemLikeCount++;
  }
  return validJsonCount > 0 && claudeMemLikeCount > 0 && claudeMemLikeCount / validJsonCount > 0.5;
}
function adaptClaudeMemToTotalRecall(content, options) {
  const result = {
    observations: [],
    summaries: [],
    prompts: [],
    skipped: []
  };
  if (!content || content.trim().length === 0) return result;
  const defaultProject = options?.defaultProject ?? DEFAULT_PROJECT;
  const lines = content.split("\n");
  let promptCounter = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]?.trim();
    if (!raw) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      result.skipped.push({
        line: i + 1,
        reason: `Invalid JSON: ${raw.substring(0, 60)}`
      });
      continue;
    }
    if (!parsed || typeof parsed !== "object") {
      result.skipped.push({
        line: i + 1,
        reason: "Record is not a JSON object"
      });
      continue;
    }
    const record = parsed;
    if (!record.content || record.content.trim().length === 0) {
      result.skipped.push({
        line: i + 1,
        originalId: record.id,
        type: record.type,
        reason: "Empty content field"
      });
      continue;
    }
    const project = record.project || defaultProject;
    const createdAt = record.created_at || (/* @__PURE__ */ new Date()).toISOString();
    const createdAtEpoch = parseEpoch(createdAt);
    const sessionId = generateSessionId(record.id, createdAt);
    const provenance = buildProvenance(record);
    const type = record.type ?? "memory";
    switch (type) {
      case "memory": {
        const obs = adaptToObservation(record, {
          project,
          createdAt,
          createdAtEpoch,
          sessionId,
          provenance
        });
        result.observations.push(obs);
        break;
      }
      case "summary": {
        const sum = adaptToSummary(record, {
          project,
          createdAt,
          createdAtEpoch,
          sessionId
        });
        result.summaries.push(sum);
        break;
      }
      case "prompt": {
        promptCounter++;
        const pmt = adaptToPrompt(record, {
          project,
          createdAt,
          createdAtEpoch,
          sessionId,
          promptNumber: promptCounter
        });
        result.prompts.push(pmt);
        break;
      }
      default: {
        result.skipped.push({
          line: i + 1,
          originalId: record.id,
          type,
          reason: `Unsupported type: "${type}". Only "memory", "summary", and "prompt" are supported.`
        });
        break;
      }
    }
  }
  return result;
}
function adaptToObservation(record, ctx) {
  const content = record.content ?? "";
  const firstNewline = content.indexOf("\n");
  const title = firstNewline > 0 && firstNewline <= 200 ? content.substring(0, firstNewline).trim() : content.substring(0, 200).trim();
  const narrative = content;
  const concepts = record.tags && record.tags.length > 0 ? record.tags.join(", ") : null;
  const contentHash = computeContentHash(ctx.project, "research", title, narrative);
  return {
    _type: "observation",
    id: 0,
    // Will be assigned on insert
    memory_session_id: ctx.sessionId,
    project: ctx.project,
    type: "research",
    title,
    subtitle: null,
    text: null,
    narrative,
    facts: ctx.provenance ?? null,
    concepts,
    files_read: null,
    files_modified: null,
    prompt_number: 0,
    content_hash: contentHash,
    discovery_tokens: estimateTokens(content),
    auto_category: "imported",
    created_at: ctx.createdAt,
    created_at_epoch: ctx.createdAtEpoch
  };
}
function adaptToSummary(record, ctx) {
  const content = record.content ?? "";
  return {
    _type: "summary",
    id: 0,
    session_id: ctx.sessionId,
    project: ctx.project,
    request: null,
    investigated: null,
    learned: content,
    completed: null,
    next_steps: null,
    notes: record.id ? `Imported from Claude Mem (${record.id})` : "Imported from Claude Mem",
    discovery_tokens: estimateTokens(content),
    created_at: ctx.createdAt,
    created_at_epoch: ctx.createdAtEpoch
  };
}
function adaptToPrompt(record, ctx) {
  return {
    _type: "prompt",
    id: 0,
    content_session_id: ctx.sessionId,
    project: ctx.project,
    prompt_number: ctx.promptNumber,
    prompt_text: record.content ?? "",
    created_at: ctx.createdAt,
    created_at_epoch: ctx.createdAtEpoch
  };
}
function buildProvenance(record) {
  const provenance = {
    _source: "claude-mem"
  };
  if (record.id) provenance["original_id"] = record.id;
  if (record.source) provenance["source"] = record.source;
  if (record.tags && record.tags.length > 0) provenance["tags"] = record.tags;
  if (record.metadata) provenance["metadata"] = record.metadata;
  return JSON.stringify(provenance);
}
function generateSessionId(id, createdAt) {
  const datePart = createdAt.substring(0, 10);
  return `${IMPORTED_SESSION_PREFIX}${datePart}`;
}
function computeContentHash(project, type, title, narrative) {
  const payload = [project, type, title, narrative].join("|");
  return createHash4("sha256").update(payload).digest("hex");
}
function parseEpoch(dateStr) {
  const ts = Date.parse(dateStr);
  return Number.isNaN(ts) ? Date.now() : ts;
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
var DEFAULT_PROJECT, IMPORTED_SESSION_PREFIX, claudeMemAdapter;
var init_claude_mem = __esm({
  "src/services/sqlite/adapters/claude-mem.ts"() {
    "use strict";
    DEFAULT_PROJECT = "claude-mem-import";
    IMPORTED_SESSION_PREFIX = "claude-mem-";
    claudeMemAdapter = {
      name: "claude-mem",
      detect: detectClaudeMemFormat,
      adapt: adaptClaudeMemToTotalRecall
    };
  }
});

// src/services/sqlite/adapters/index.ts
var adapters_exports = {};
__export(adapters_exports, {
  claudeMemAdapter: () => claudeMemAdapter,
  detectAdapter: () => detectAdapter,
  getAdapter: () => getAdapter,
  listAdapters: () => listAdapters
});
function getAdapter(name) {
  return adapters.find((a) => a.name === name);
}
function detectAdapter(content) {
  return adapters.find((a) => a.detect(content));
}
function listAdapters() {
  return adapters.map((a) => a.name);
}
var adapters;
var init_adapters = __esm({
  "src/services/sqlite/adapters/index.ts"() {
    "use strict";
    init_claude_mem();
    init_claude_mem();
    adapters = [
      claudeMemAdapter
    ];
  }
});

// src/services/service-installer.ts
var service_installer_exports = {};
__export(service_installer_exports, {
  detectStrategy: () => detectStrategy,
  install: () => install,
  status: () => status,
  uninstall: () => uninstall
});
import { execSync as execSync2, spawnSync } from "child_process";
import { join as join6, dirname as dirname2 } from "path";
import { existsSync as existsSync7, writeFileSync as writeFileSync4, mkdirSync as mkdirSync6, unlinkSync as unlinkSync2 } from "fs";
import { homedir as homedir3 } from "os";
function resolveWorkerPath() {
  const candidates = [
    join6(dirname2(new URL(import.meta.url).pathname), "..", "worker-service.js"),
    join6(dirname2(new URL(import.meta.url).pathname), "worker-service.js")
  ];
  for (const p of candidates) {
    if (existsSync7(p)) return p;
  }
  return candidates[0];
}
function getNodePath() {
  return process.execPath;
}
function isSystemdUserAvailable() {
  try {
    const result = spawnSync("systemctl", ["--user", "status"], {
      timeout: 3e3,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stderr = result.stderr?.toString() || "";
    if (stderr.includes("Failed to connect")) return false;
    return result.status === 0 && !result.error;
  } catch {
    return false;
  }
}
function isCrontabAvailable() {
  try {
    spawnSync("crontab", ["-l"], { timeout: 3e3, stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}
function detectStrategy() {
  if (isSystemdUserAvailable()) return "systemd";
  if (isCrontabAvailable()) return "crontab";
  return "none";
}
function getCrontab() {
  try {
    return execSync2("crontab -l 2>/dev/null", { encoding: "utf8" });
  } catch {
    return "";
  }
}
function setCrontab(content) {
  const tmp = join6(DATA_DIR, ".crontab-tmp");
  writeFileSync4(tmp, content, "utf8");
  try {
    execSync2(`crontab "${tmp}"`, { stdio: "pipe" });
  } finally {
    try {
      unlinkSync2(tmp);
    } catch {
    }
  }
}
function buildCrontabEntry() {
  const nodePath = getNodePath();
  const workerPath = resolveWorkerPath();
  const env = `TOTALRECALL_DATA_DIR=${DATA_DIR}`;
  return `@reboot ${env} ${nodePath} ${workerPath} ${CRONTAB_MARKER}`;
}
function installCrontab() {
  const existing = getCrontab();
  if (existing.includes(CRONTAB_MARKER)) {
    return { strategy: "crontab", success: true, message: "Already installed (crontab @reboot)" };
  }
  const entry = buildCrontabEntry();
  const newCrontab = existing.trimEnd() + "\n" + entry + "\n";
  setCrontab(newCrontab);
  return { strategy: "crontab", success: true, message: `Installed crontab @reboot entry. Worker will start on boot.` };
}
function uninstallCrontab() {
  const existing = getCrontab();
  if (!existing.includes(CRONTAB_MARKER)) {
    return { strategy: "crontab", success: true, message: "Not installed (crontab)" };
  }
  const filtered = existing.split("\n").filter((line) => !line.includes(CRONTAB_MARKER)).join("\n");
  setCrontab(filtered);
  return { strategy: "crontab", success: true, message: "Removed crontab @reboot entry." };
}
function getSystemdDir() {
  return join6(homedir3(), ".config", "systemd", "user");
}
function getServiceFilePath() {
  return join6(getSystemdDir(), `${SYSTEMD_SERVICE_NAME}.service`);
}
function buildServiceFile() {
  const nodePath = getNodePath();
  const workerPath = resolveWorkerPath();
  return `[Unit]
Description=TotalRecall Worker \u2014 persistent AI memory
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${workerPath}
Environment=TOTALRECALL_DATA_DIR=${DATA_DIR}
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=3
WorkingDirectory=${homedir3()}

[Install]
WantedBy=default.target
`;
}
function installSystemd() {
  const dir = getSystemdDir();
  mkdirSync6(dir, { recursive: true });
  const servicePath = getServiceFilePath();
  writeFileSync4(servicePath, buildServiceFile(), "utf8");
  try {
    execSync2("systemctl --user daemon-reload", { stdio: "pipe" });
    execSync2(`systemctl --user enable ${SYSTEMD_SERVICE_NAME}`, { stdio: "pipe" });
    execSync2(`systemctl --user start ${SYSTEMD_SERVICE_NAME}`, { stdio: "pipe" });
  } catch (err) {
    return { strategy: "systemd", success: false, message: `Service file created but activation failed: ${err}` };
  }
  return { strategy: "systemd", success: true, message: `Installed and started systemd user service.` };
}
function uninstallSystemd() {
  try {
    execSync2(`systemctl --user stop ${SYSTEMD_SERVICE_NAME} 2>/dev/null`, { stdio: "pipe" });
    execSync2(`systemctl --user disable ${SYSTEMD_SERVICE_NAME} 2>/dev/null`, { stdio: "pipe" });
  } catch {
  }
  const servicePath = getServiceFilePath();
  if (existsSync7(servicePath)) {
    unlinkSync2(servicePath);
    try {
      execSync2("systemctl --user daemon-reload", { stdio: "pipe" });
    } catch {
    }
  }
  return { strategy: "systemd", success: true, message: "Removed systemd user service." };
}
function install() {
  const strategy = detectStrategy();
  switch (strategy) {
    case "systemd":
      return installSystemd();
    case "crontab":
      return installCrontab();
    default:
      return { strategy: "none", success: false, message: "No supported service manager found (need crontab or systemd --user)." };
  }
}
function uninstall() {
  const results = [];
  if (existsSync7(getServiceFilePath())) {
    results.push(uninstallSystemd());
  }
  const crontab = getCrontab();
  if (crontab.includes(CRONTAB_MARKER)) {
    results.push(uninstallCrontab());
  }
  if (results.length === 0) {
    return { strategy: "none", success: true, message: "No service installation found." };
  }
  return results[results.length - 1];
}
function status() {
  if (existsSync7(getServiceFilePath())) {
    try {
      const out = execSync2(`systemctl --user is-active ${SYSTEMD_SERVICE_NAME} 2>/dev/null`, { encoding: "utf8" }).trim();
      return { installed: true, strategy: "systemd", running: out === "active", details: `systemd: ${out}` };
    } catch {
      return { installed: true, strategy: "systemd", running: false, details: "systemd: inactive or bus unavailable" };
    }
  }
  const crontab = getCrontab();
  if (crontab.includes(CRONTAB_MARKER)) {
    return { installed: true, strategy: "crontab", running: false, details: "crontab @reboot entry present (check worker:status for runtime)" };
  }
  return { installed: false, strategy: "none", running: false, details: "No service installed. Run: totalrecall service install" };
}
var CRONTAB_MARKER, SYSTEMD_SERVICE_NAME;
var init_service_installer = __esm({
  "src/services/service-installer.ts"() {
    "use strict";
    init_paths();
    CRONTAB_MARKER = "# totalrecall-worker-autostart";
    SYSTEMD_SERVICE_NAME = "totalrecall-worker";
  }
});

// src/services/sqlite/Users.ts
var Users_exports = {};
__export(Users_exports, {
  cleanExpiredSessions: () => cleanExpiredSessions,
  countAdmins: () => countAdmins,
  createAuthSession: () => createAuthSession,
  createUser: () => createUser,
  deactivateUser: () => deactivateUser,
  deleteAuthSession: () => deleteAuthSession,
  deleteUserSessions: () => deleteUserSessions,
  getAuditLog: () => getAuditLog,
  getSessionByRefreshToken: () => getSessionByRefreshToken,
  getUserByEmail: () => getUserByEmail,
  getUserById: () => getUserById,
  isValidRole: () => isValidRole,
  listUsers: () => listUsers,
  logAction: () => logAction,
  toPublicUser: () => toPublicUser,
  updateUserLastLogin: () => updateUserLastLogin,
  updateUserRole: () => updateUserRole
});
import crypto from "crypto";
function createUser(db, email, passwordHash, role, displayName) {
  const id = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
    last_login: null
  };
}
function getUserByEmail(db, email) {
  const query = db.query("SELECT * FROM users WHERE email = ? AND is_active = 1");
  return query.get(email);
}
function getUserById(db, id) {
  const query = db.query("SELECT * FROM users WHERE id = ?");
  return query.get(id);
}
function listUsers(db) {
  const query = db.query(
    "SELECT id, email, role, display_name, avatar_url, is_active, created_at, last_login FROM users ORDER BY created_at ASC"
  );
  return query.all();
}
function updateUserRole(db, id, role) {
  const result = db.run("UPDATE users SET role = ? WHERE id = ?", [role, id]);
  return result.changes > 0;
}
function updateUserLastLogin(db, id) {
  db.run("UPDATE users SET last_login = ? WHERE id = ?", [(/* @__PURE__ */ new Date()).toISOString(), id]);
}
function deactivateUser(db, id) {
  const result = db.run("UPDATE users SET is_active = 0 WHERE id = ?", [id]);
  return result.changes > 0;
}
function countAdmins(db) {
  const query = db.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1");
  const row = query.get();
  return row?.count ?? 0;
}
function createAuthSession(db, userId, token, refreshToken, expiresAt, refreshExpiresAt) {
  const id = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.run(
    `INSERT INTO sessions_auth (id, user_id, token, refresh_token, expires_at, refresh_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, token, refreshToken, expiresAt, refreshExpiresAt, now]
  );
  return { id, user_id: userId, token, refresh_token: refreshToken, expires_at: expiresAt, refresh_expires_at: refreshExpiresAt, created_at: now };
}
function getSessionByRefreshToken(db, refreshToken) {
  const query = db.query("SELECT * FROM sessions_auth WHERE refresh_token = ?");
  return query.get(refreshToken);
}
function deleteAuthSession(db, token) {
  db.run("DELETE FROM sessions_auth WHERE token = ?", [token]);
}
function deleteUserSessions(db, userId) {
  db.run("DELETE FROM sessions_auth WHERE user_id = ?", [userId]);
}
function cleanExpiredSessions(db) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = db.run("DELETE FROM sessions_auth WHERE refresh_expires_at < ?", [now]);
  return result.changes;
}
function logAction(db, userId, action, target = null, details = null, ipAddress = null) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.run(
    `INSERT INTO audit_log (user_id, action, target, details, ip_address, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, action, target, details, ipAddress, now]
  );
}
function getAuditLog(db, limit = 100, offset = 0) {
  const query = db.query(`
    SELECT a.id, a.user_id, u.email as user_email, a.action, a.target, a.details, a.ip_address, a.timestamp
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.timestamp DESC
    LIMIT ? OFFSET ?
  `);
  return query.all(limit, offset);
}
function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    is_active: user.is_active,
    created_at: user.created_at,
    last_login: user.last_login
  };
}
function isValidRole(role) {
  return typeof role === "string" && VALID_ROLES.has(role);
}
var VALID_ROLES;
var init_Users = __esm({
  "src/services/sqlite/Users.ts"() {
    "use strict";
    VALID_ROLES = /* @__PURE__ */ new Set(["admin", "editor", "viewer"]);
  }
});

// node_modules/bcryptjs/dist/bcrypt.js
var require_bcrypt = __commonJS({
  "node_modules/bcryptjs/dist/bcrypt.js"(exports, module) {
    (function(global, factory) {
      if (typeof define === "function" && define["amd"])
        define([], factory);
      else if (typeof __require === "function" && typeof module === "object" && module && module["exports"])
        module["exports"] = factory();
      else
        (global["dcodeIO"] = global["dcodeIO"] || {})["bcrypt"] = factory();
    })(exports, function() {
      "use strict";
      var bcrypt = {};
      var randomFallback = null;
      function random(len) {
        if (typeof module !== "undefined" && module && module["exports"])
          try {
            return __require("crypto")["randomBytes"](len);
          } catch (e) {
          }
        try {
          var a;
          (self["crypto"] || self["msCrypto"])["getRandomValues"](a = new Uint32Array(len));
          return Array.prototype.slice.call(a);
        } catch (e) {
        }
        if (!randomFallback)
          throw Error("Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative");
        return randomFallback(len);
      }
      var randomAvailable = false;
      try {
        random(1);
        randomAvailable = true;
      } catch (e) {
      }
      randomFallback = null;
      bcrypt.setRandomFallback = function(random2) {
        randomFallback = random2;
      };
      bcrypt.genSaltSync = function(rounds, seed_length) {
        rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
        if (typeof rounds !== "number")
          throw Error("Illegal arguments: " + typeof rounds + ", " + typeof seed_length);
        if (rounds < 4)
          rounds = 4;
        else if (rounds > 31)
          rounds = 31;
        var salt = [];
        salt.push("$2a$");
        if (rounds < 10)
          salt.push("0");
        salt.push(rounds.toString());
        salt.push("$");
        salt.push(base64_encode(random(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
        return salt.join("");
      };
      bcrypt.genSalt = function(rounds, seed_length, callback) {
        if (typeof seed_length === "function")
          callback = seed_length, seed_length = void 0;
        if (typeof rounds === "function")
          callback = rounds, rounds = void 0;
        if (typeof rounds === "undefined")
          rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
        else if (typeof rounds !== "number")
          throw Error("illegal arguments: " + typeof rounds);
        function _async(callback2) {
          nextTick(function() {
            try {
              callback2(null, bcrypt.genSaltSync(rounds));
            } catch (err) {
              callback2(err);
            }
          });
        }
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err, res) {
              if (err) {
                reject(err);
                return;
              }
              resolve(res);
            });
          });
      };
      bcrypt.hashSync = function(s, salt) {
        if (typeof salt === "undefined")
          salt = GENSALT_DEFAULT_LOG2_ROUNDS;
        if (typeof salt === "number")
          salt = bcrypt.genSaltSync(salt);
        if (typeof s !== "string" || typeof salt !== "string")
          throw Error("Illegal arguments: " + typeof s + ", " + typeof salt);
        return _hash(s, salt);
      };
      bcrypt.hash = function(s, salt, callback, progressCallback) {
        function _async(callback2) {
          if (typeof s === "string" && typeof salt === "number")
            bcrypt.genSalt(salt, function(err, salt2) {
              _hash(s, salt2, callback2, progressCallback);
            });
          else if (typeof s === "string" && typeof salt === "string")
            _hash(s, salt, callback2, progressCallback);
          else
            nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof salt)));
        }
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err, res) {
              if (err) {
                reject(err);
                return;
              }
              resolve(res);
            });
          });
      };
      function safeStringCompare(known, unknown) {
        var right = 0, wrong = 0;
        for (var i = 0, k = known.length; i < k; ++i) {
          if (known.charCodeAt(i) === unknown.charCodeAt(i))
            ++right;
          else
            ++wrong;
        }
        if (right < 0)
          return false;
        return wrong === 0;
      }
      bcrypt.compareSync = function(s, hash) {
        if (typeof s !== "string" || typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof s + ", " + typeof hash);
        if (hash.length !== 60)
          return false;
        return safeStringCompare(bcrypt.hashSync(s, hash.substr(0, hash.length - 31)), hash);
      };
      bcrypt.compare = function(s, hash, callback, progressCallback) {
        function _async(callback2) {
          if (typeof s !== "string" || typeof hash !== "string") {
            nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof hash)));
            return;
          }
          if (hash.length !== 60) {
            nextTick(callback2.bind(this, null, false));
            return;
          }
          bcrypt.hash(s, hash.substr(0, 29), function(err, comp) {
            if (err)
              callback2(err);
            else
              callback2(null, safeStringCompare(comp, hash));
          }, progressCallback);
        }
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err, res) {
              if (err) {
                reject(err);
                return;
              }
              resolve(res);
            });
          });
      };
      bcrypt.getRounds = function(hash) {
        if (typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof hash);
        return parseInt(hash.split("$")[2], 10);
      };
      bcrypt.getSalt = function(hash) {
        if (typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof hash);
        if (hash.length !== 60)
          throw Error("Illegal hash length: " + hash.length + " != 60");
        return hash.substring(0, 29);
      };
      var nextTick = typeof process !== "undefined" && process && typeof process.nextTick === "function" ? typeof setImmediate === "function" ? setImmediate : process.nextTick : setTimeout;
      function stringToBytes(str) {
        var out = [], i = 0;
        utfx.encodeUTF16toUTF8(function() {
          if (i >= str.length) return null;
          return str.charCodeAt(i++);
        }, function(b) {
          out.push(b);
        });
        return out;
      }
      var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
      var BASE64_INDEX = [
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        0,
        1,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62,
        63,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        -1,
        -1,
        -1,
        -1,
        -1
      ];
      var stringFromCharCode = String.fromCharCode;
      function base64_encode(b, len) {
        var off = 0, rs = [], c1, c2;
        if (len <= 0 || len > b.length)
          throw Error("Illegal len: " + len);
        while (off < len) {
          c1 = b[off++] & 255;
          rs.push(BASE64_CODE[c1 >> 2 & 63]);
          c1 = (c1 & 3) << 4;
          if (off >= len) {
            rs.push(BASE64_CODE[c1 & 63]);
            break;
          }
          c2 = b[off++] & 255;
          c1 |= c2 >> 4 & 15;
          rs.push(BASE64_CODE[c1 & 63]);
          c1 = (c2 & 15) << 2;
          if (off >= len) {
            rs.push(BASE64_CODE[c1 & 63]);
            break;
          }
          c2 = b[off++] & 255;
          c1 |= c2 >> 6 & 3;
          rs.push(BASE64_CODE[c1 & 63]);
          rs.push(BASE64_CODE[c2 & 63]);
        }
        return rs.join("");
      }
      function base64_decode(s, len) {
        var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
        if (len <= 0)
          throw Error("Illegal len: " + len);
        while (off < slen - 1 && olen < len) {
          code = s.charCodeAt(off++);
          c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          code = s.charCodeAt(off++);
          c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          if (c1 == -1 || c2 == -1)
            break;
          o = c1 << 2 >>> 0;
          o |= (c2 & 48) >> 4;
          rs.push(stringFromCharCode(o));
          if (++olen >= len || off >= slen)
            break;
          code = s.charCodeAt(off++);
          c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          if (c3 == -1)
            break;
          o = (c2 & 15) << 4 >>> 0;
          o |= (c3 & 60) >> 2;
          rs.push(stringFromCharCode(o));
          if (++olen >= len || off >= slen)
            break;
          code = s.charCodeAt(off++);
          c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          o = (c3 & 3) << 6 >>> 0;
          o |= c4;
          rs.push(stringFromCharCode(o));
          ++olen;
        }
        var res = [];
        for (off = 0; off < olen; off++)
          res.push(rs[off].charCodeAt(0));
        return res;
      }
      var utfx = (function() {
        "use strict";
        var utfx2 = {};
        utfx2.MAX_CODEPOINT = 1114111;
        utfx2.encodeUTF8 = function(src, dst) {
          var cp = null;
          if (typeof src === "number")
            cp = src, src = function() {
              return null;
            };
          while (cp !== null || (cp = src()) !== null) {
            if (cp < 128)
              dst(cp & 127);
            else if (cp < 2048)
              dst(cp >> 6 & 31 | 192), dst(cp & 63 | 128);
            else if (cp < 65536)
              dst(cp >> 12 & 15 | 224), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
            else
              dst(cp >> 18 & 7 | 240), dst(cp >> 12 & 63 | 128), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
            cp = null;
          }
        };
        utfx2.decodeUTF8 = function(src, dst) {
          var a, b, c, d, fail = function(b2) {
            b2 = b2.slice(0, b2.indexOf(null));
            var err = Error(b2.toString());
            err.name = "TruncatedError";
            err["bytes"] = b2;
            throw err;
          };
          while ((a = src()) !== null) {
            if ((a & 128) === 0)
              dst(a);
            else if ((a & 224) === 192)
              (b = src()) === null && fail([a, b]), dst((a & 31) << 6 | b & 63);
            else if ((a & 240) === 224)
              ((b = src()) === null || (c = src()) === null) && fail([a, b, c]), dst((a & 15) << 12 | (b & 63) << 6 | c & 63);
            else if ((a & 248) === 240)
              ((b = src()) === null || (c = src()) === null || (d = src()) === null) && fail([a, b, c, d]), dst((a & 7) << 18 | (b & 63) << 12 | (c & 63) << 6 | d & 63);
            else throw RangeError("Illegal starting byte: " + a);
          }
        };
        utfx2.UTF16toUTF8 = function(src, dst) {
          var c1, c2 = null;
          while (true) {
            if ((c1 = c2 !== null ? c2 : src()) === null)
              break;
            if (c1 >= 55296 && c1 <= 57343) {
              if ((c2 = src()) !== null) {
                if (c2 >= 56320 && c2 <= 57343) {
                  dst((c1 - 55296) * 1024 + c2 - 56320 + 65536);
                  c2 = null;
                  continue;
                }
              }
            }
            dst(c1);
          }
          if (c2 !== null) dst(c2);
        };
        utfx2.UTF8toUTF16 = function(src, dst) {
          var cp = null;
          if (typeof src === "number")
            cp = src, src = function() {
              return null;
            };
          while (cp !== null || (cp = src()) !== null) {
            if (cp <= 65535)
              dst(cp);
            else
              cp -= 65536, dst((cp >> 10) + 55296), dst(cp % 1024 + 56320);
            cp = null;
          }
        };
        utfx2.encodeUTF16toUTF8 = function(src, dst) {
          utfx2.UTF16toUTF8(src, function(cp) {
            utfx2.encodeUTF8(cp, dst);
          });
        };
        utfx2.decodeUTF8toUTF16 = function(src, dst) {
          utfx2.decodeUTF8(src, function(cp) {
            utfx2.UTF8toUTF16(cp, dst);
          });
        };
        utfx2.calculateCodePoint = function(cp) {
          return cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
        };
        utfx2.calculateUTF8 = function(src) {
          var cp, l = 0;
          while ((cp = src()) !== null)
            l += utfx2.calculateCodePoint(cp);
          return l;
        };
        utfx2.calculateUTF16asUTF8 = function(src) {
          var n = 0, l = 0;
          utfx2.UTF16toUTF8(src, function(cp) {
            ++n;
            l += utfx2.calculateCodePoint(cp);
          });
          return [n, l];
        };
        return utfx2;
      })();
      Date.now = Date.now || function() {
        return +/* @__PURE__ */ new Date();
      };
      var BCRYPT_SALT_LEN = 16;
      var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
      var BLOWFISH_NUM_ROUNDS = 16;
      var MAX_EXECUTION_TIME = 100;
      var P_ORIG = [
        608135816,
        2242054355,
        320440878,
        57701188,
        2752067618,
        698298832,
        137296536,
        3964562569,
        1160258022,
        953160567,
        3193202383,
        887688300,
        3232508343,
        3380367581,
        1065670069,
        3041331479,
        2450970073,
        2306472731
      ];
      var S_ORIG = [
        3509652390,
        2564797868,
        805139163,
        3491422135,
        3101798381,
        1780907670,
        3128725573,
        4046225305,
        614570311,
        3012652279,
        134345442,
        2240740374,
        1667834072,
        1901547113,
        2757295779,
        4103290238,
        227898511,
        1921955416,
        1904987480,
        2182433518,
        2069144605,
        3260701109,
        2620446009,
        720527379,
        3318853667,
        677414384,
        3393288472,
        3101374703,
        2390351024,
        1614419982,
        1822297739,
        2954791486,
        3608508353,
        3174124327,
        2024746970,
        1432378464,
        3864339955,
        2857741204,
        1464375394,
        1676153920,
        1439316330,
        715854006,
        3033291828,
        289532110,
        2706671279,
        2087905683,
        3018724369,
        1668267050,
        732546397,
        1947742710,
        3462151702,
        2609353502,
        2950085171,
        1814351708,
        2050118529,
        680887927,
        999245976,
        1800124847,
        3300911131,
        1713906067,
        1641548236,
        4213287313,
        1216130144,
        1575780402,
        4018429277,
        3917837745,
        3693486850,
        3949271944,
        596196993,
        3549867205,
        258830323,
        2213823033,
        772490370,
        2760122372,
        1774776394,
        2652871518,
        566650946,
        4142492826,
        1728879713,
        2882767088,
        1783734482,
        3629395816,
        2517608232,
        2874225571,
        1861159788,
        326777828,
        3124490320,
        2130389656,
        2716951837,
        967770486,
        1724537150,
        2185432712,
        2364442137,
        1164943284,
        2105845187,
        998989502,
        3765401048,
        2244026483,
        1075463327,
        1455516326,
        1322494562,
        910128902,
        469688178,
        1117454909,
        936433444,
        3490320968,
        3675253459,
        1240580251,
        122909385,
        2157517691,
        634681816,
        4142456567,
        3825094682,
        3061402683,
        2540495037,
        79693498,
        3249098678,
        1084186820,
        1583128258,
        426386531,
        1761308591,
        1047286709,
        322548459,
        995290223,
        1845252383,
        2603652396,
        3431023940,
        2942221577,
        3202600964,
        3727903485,
        1712269319,
        422464435,
        3234572375,
        1170764815,
        3523960633,
        3117677531,
        1434042557,
        442511882,
        3600875718,
        1076654713,
        1738483198,
        4213154764,
        2393238008,
        3677496056,
        1014306527,
        4251020053,
        793779912,
        2902807211,
        842905082,
        4246964064,
        1395751752,
        1040244610,
        2656851899,
        3396308128,
        445077038,
        3742853595,
        3577915638,
        679411651,
        2892444358,
        2354009459,
        1767581616,
        3150600392,
        3791627101,
        3102740896,
        284835224,
        4246832056,
        1258075500,
        768725851,
        2589189241,
        3069724005,
        3532540348,
        1274779536,
        3789419226,
        2764799539,
        1660621633,
        3471099624,
        4011903706,
        913787905,
        3497959166,
        737222580,
        2514213453,
        2928710040,
        3937242737,
        1804850592,
        3499020752,
        2949064160,
        2386320175,
        2390070455,
        2415321851,
        4061277028,
        2290661394,
        2416832540,
        1336762016,
        1754252060,
        3520065937,
        3014181293,
        791618072,
        3188594551,
        3933548030,
        2332172193,
        3852520463,
        3043980520,
        413987798,
        3465142937,
        3030929376,
        4245938359,
        2093235073,
        3534596313,
        375366246,
        2157278981,
        2479649556,
        555357303,
        3870105701,
        2008414854,
        3344188149,
        4221384143,
        3956125452,
        2067696032,
        3594591187,
        2921233993,
        2428461,
        544322398,
        577241275,
        1471733935,
        610547355,
        4027169054,
        1432588573,
        1507829418,
        2025931657,
        3646575487,
        545086370,
        48609733,
        2200306550,
        1653985193,
        298326376,
        1316178497,
        3007786442,
        2064951626,
        458293330,
        2589141269,
        3591329599,
        3164325604,
        727753846,
        2179363840,
        146436021,
        1461446943,
        4069977195,
        705550613,
        3059967265,
        3887724982,
        4281599278,
        3313849956,
        1404054877,
        2845806497,
        146425753,
        1854211946,
        1266315497,
        3048417604,
        3681880366,
        3289982499,
        290971e4,
        1235738493,
        2632868024,
        2414719590,
        3970600049,
        1771706367,
        1449415276,
        3266420449,
        422970021,
        1963543593,
        2690192192,
        3826793022,
        1062508698,
        1531092325,
        1804592342,
        2583117782,
        2714934279,
        4024971509,
        1294809318,
        4028980673,
        1289560198,
        2221992742,
        1669523910,
        35572830,
        157838143,
        1052438473,
        1016535060,
        1802137761,
        1753167236,
        1386275462,
        3080475397,
        2857371447,
        1040679964,
        2145300060,
        2390574316,
        1461121720,
        2956646967,
        4031777805,
        4028374788,
        33600511,
        2920084762,
        1018524850,
        629373528,
        3691585981,
        3515945977,
        2091462646,
        2486323059,
        586499841,
        988145025,
        935516892,
        3367335476,
        2599673255,
        2839830854,
        265290510,
        3972581182,
        2759138881,
        3795373465,
        1005194799,
        847297441,
        406762289,
        1314163512,
        1332590856,
        1866599683,
        4127851711,
        750260880,
        613907577,
        1450815602,
        3165620655,
        3734664991,
        3650291728,
        3012275730,
        3704569646,
        1427272223,
        778793252,
        1343938022,
        2676280711,
        2052605720,
        1946737175,
        3164576444,
        3914038668,
        3967478842,
        3682934266,
        1661551462,
        3294938066,
        4011595847,
        840292616,
        3712170807,
        616741398,
        312560963,
        711312465,
        1351876610,
        322626781,
        1910503582,
        271666773,
        2175563734,
        1594956187,
        70604529,
        3617834859,
        1007753275,
        1495573769,
        4069517037,
        2549218298,
        2663038764,
        504708206,
        2263041392,
        3941167025,
        2249088522,
        1514023603,
        1998579484,
        1312622330,
        694541497,
        2582060303,
        2151582166,
        1382467621,
        776784248,
        2618340202,
        3323268794,
        2497899128,
        2784771155,
        503983604,
        4076293799,
        907881277,
        423175695,
        432175456,
        1378068232,
        4145222326,
        3954048622,
        3938656102,
        3820766613,
        2793130115,
        2977904593,
        26017576,
        3274890735,
        3194772133,
        1700274565,
        1756076034,
        4006520079,
        3677328699,
        720338349,
        1533947780,
        354530856,
        688349552,
        3973924725,
        1637815568,
        332179504,
        3949051286,
        53804574,
        2852348879,
        3044236432,
        1282449977,
        3583942155,
        3416972820,
        4006381244,
        1617046695,
        2628476075,
        3002303598,
        1686838959,
        431878346,
        2686675385,
        1700445008,
        1080580658,
        1009431731,
        832498133,
        3223435511,
        2605976345,
        2271191193,
        2516031870,
        1648197032,
        4164389018,
        2548247927,
        300782431,
        375919233,
        238389289,
        3353747414,
        2531188641,
        2019080857,
        1475708069,
        455242339,
        2609103871,
        448939670,
        3451063019,
        1395535956,
        2413381860,
        1841049896,
        1491858159,
        885456874,
        4264095073,
        4001119347,
        1565136089,
        3898914787,
        1108368660,
        540939232,
        1173283510,
        2745871338,
        3681308437,
        4207628240,
        3343053890,
        4016749493,
        1699691293,
        1103962373,
        3625875870,
        2256883143,
        3830138730,
        1031889488,
        3479347698,
        1535977030,
        4236805024,
        3251091107,
        2132092099,
        1774941330,
        1199868427,
        1452454533,
        157007616,
        2904115357,
        342012276,
        595725824,
        1480756522,
        206960106,
        497939518,
        591360097,
        863170706,
        2375253569,
        3596610801,
        1814182875,
        2094937945,
        3421402208,
        1082520231,
        3463918190,
        2785509508,
        435703966,
        3908032597,
        1641649973,
        2842273706,
        3305899714,
        1510255612,
        2148256476,
        2655287854,
        3276092548,
        4258621189,
        236887753,
        3681803219,
        274041037,
        1734335097,
        3815195456,
        3317970021,
        1899903192,
        1026095262,
        4050517792,
        356393447,
        2410691914,
        3873677099,
        3682840055,
        3913112168,
        2491498743,
        4132185628,
        2489919796,
        1091903735,
        1979897079,
        3170134830,
        3567386728,
        3557303409,
        857797738,
        1136121015,
        1342202287,
        507115054,
        2535736646,
        337727348,
        3213592640,
        1301675037,
        2528481711,
        1895095763,
        1721773893,
        3216771564,
        62756741,
        2142006736,
        835421444,
        2531993523,
        1442658625,
        3659876326,
        2882144922,
        676362277,
        1392781812,
        170690266,
        3921047035,
        1759253602,
        3611846912,
        1745797284,
        664899054,
        1329594018,
        3901205900,
        3045908486,
        2062866102,
        2865634940,
        3543621612,
        3464012697,
        1080764994,
        553557557,
        3656615353,
        3996768171,
        991055499,
        499776247,
        1265440854,
        648242737,
        3940784050,
        980351604,
        3713745714,
        1749149687,
        3396870395,
        4211799374,
        3640570775,
        1161844396,
        3125318951,
        1431517754,
        545492359,
        4268468663,
        3499529547,
        1437099964,
        2702547544,
        3433638243,
        2581715763,
        2787789398,
        1060185593,
        1593081372,
        2418618748,
        4260947970,
        69676912,
        2159744348,
        86519011,
        2512459080,
        3838209314,
        1220612927,
        3339683548,
        133810670,
        1090789135,
        1078426020,
        1569222167,
        845107691,
        3583754449,
        4072456591,
        1091646820,
        628848692,
        1613405280,
        3757631651,
        526609435,
        236106946,
        48312990,
        2942717905,
        3402727701,
        1797494240,
        859738849,
        992217954,
        4005476642,
        2243076622,
        3870952857,
        3732016268,
        765654824,
        3490871365,
        2511836413,
        1685915746,
        3888969200,
        1414112111,
        2273134842,
        3281911079,
        4080962846,
        172450625,
        2569994100,
        980381355,
        4109958455,
        2819808352,
        2716589560,
        2568741196,
        3681446669,
        3329971472,
        1835478071,
        660984891,
        3704678404,
        4045999559,
        3422617507,
        3040415634,
        1762651403,
        1719377915,
        3470491036,
        2693910283,
        3642056355,
        3138596744,
        1364962596,
        2073328063,
        1983633131,
        926494387,
        3423689081,
        2150032023,
        4096667949,
        1749200295,
        3328846651,
        309677260,
        2016342300,
        1779581495,
        3079819751,
        111262694,
        1274766160,
        443224088,
        298511866,
        1025883608,
        3806446537,
        1145181785,
        168956806,
        3641502830,
        3584813610,
        1689216846,
        3666258015,
        3200248200,
        1692713982,
        2646376535,
        4042768518,
        1618508792,
        1610833997,
        3523052358,
        4130873264,
        2001055236,
        3610705100,
        2202168115,
        4028541809,
        2961195399,
        1006657119,
        2006996926,
        3186142756,
        1430667929,
        3210227297,
        1314452623,
        4074634658,
        4101304120,
        2273951170,
        1399257539,
        3367210612,
        3027628629,
        1190975929,
        2062231137,
        2333990788,
        2221543033,
        2438960610,
        1181637006,
        548689776,
        2362791313,
        3372408396,
        3104550113,
        3145860560,
        296247880,
        1970579870,
        3078560182,
        3769228297,
        1714227617,
        3291629107,
        3898220290,
        166772364,
        1251581989,
        493813264,
        448347421,
        195405023,
        2709975567,
        677966185,
        3703036547,
        1463355134,
        2715995803,
        1338867538,
        1343315457,
        2802222074,
        2684532164,
        233230375,
        2599980071,
        2000651841,
        3277868038,
        1638401717,
        4028070440,
        3237316320,
        6314154,
        819756386,
        300326615,
        590932579,
        1405279636,
        3267499572,
        3150704214,
        2428286686,
        3959192993,
        3461946742,
        1862657033,
        1266418056,
        963775037,
        2089974820,
        2263052895,
        1917689273,
        448879540,
        3550394620,
        3981727096,
        150775221,
        3627908307,
        1303187396,
        508620638,
        2975983352,
        2726630617,
        1817252668,
        1876281319,
        1457606340,
        908771278,
        3720792119,
        3617206836,
        2455994898,
        1729034894,
        1080033504,
        976866871,
        3556439503,
        2881648439,
        1522871579,
        1555064734,
        1336096578,
        3548522304,
        2579274686,
        3574697629,
        3205460757,
        3593280638,
        3338716283,
        3079412587,
        564236357,
        2993598910,
        1781952180,
        1464380207,
        3163844217,
        3332601554,
        1699332808,
        1393555694,
        1183702653,
        3581086237,
        1288719814,
        691649499,
        2847557200,
        2895455976,
        3193889540,
        2717570544,
        1781354906,
        1676643554,
        2592534050,
        3230253752,
        1126444790,
        2770207658,
        2633158820,
        2210423226,
        2615765581,
        2414155088,
        3127139286,
        673620729,
        2805611233,
        1269405062,
        4015350505,
        3341807571,
        4149409754,
        1057255273,
        2012875353,
        2162469141,
        2276492801,
        2601117357,
        993977747,
        3918593370,
        2654263191,
        753973209,
        36408145,
        2530585658,
        25011837,
        3520020182,
        2088578344,
        530523599,
        2918365339,
        1524020338,
        1518925132,
        3760827505,
        3759777254,
        1202760957,
        3985898139,
        3906192525,
        674977740,
        4174734889,
        2031300136,
        2019492241,
        3983892565,
        4153806404,
        3822280332,
        352677332,
        2297720250,
        60907813,
        90501309,
        3286998549,
        1016092578,
        2535922412,
        2839152426,
        457141659,
        509813237,
        4120667899,
        652014361,
        1966332200,
        2975202805,
        55981186,
        2327461051,
        676427537,
        3255491064,
        2882294119,
        3433927263,
        1307055953,
        942726286,
        933058658,
        2468411793,
        3933900994,
        4215176142,
        1361170020,
        2001714738,
        2830558078,
        3274259782,
        1222529897,
        1679025792,
        2729314320,
        3714953764,
        1770335741,
        151462246,
        3013232138,
        1682292957,
        1483529935,
        471910574,
        1539241949,
        458788160,
        3436315007,
        1807016891,
        3718408830,
        978976581,
        1043663428,
        3165965781,
        1927990952,
        4200891579,
        2372276910,
        3208408903,
        3533431907,
        1412390302,
        2931980059,
        4132332400,
        1947078029,
        3881505623,
        4168226417,
        2941484381,
        1077988104,
        1320477388,
        886195818,
        18198404,
        3786409e3,
        2509781533,
        112762804,
        3463356488,
        1866414978,
        891333506,
        18488651,
        661792760,
        1628790961,
        3885187036,
        3141171499,
        876946877,
        2693282273,
        1372485963,
        791857591,
        2686433993,
        3759982718,
        3167212022,
        3472953795,
        2716379847,
        445679433,
        3561995674,
        3504004811,
        3574258232,
        54117162,
        3331405415,
        2381918588,
        3769707343,
        4154350007,
        1140177722,
        4074052095,
        668550556,
        3214352940,
        367459370,
        261225585,
        2610173221,
        4209349473,
        3468074219,
        3265815641,
        314222801,
        3066103646,
        3808782860,
        282218597,
        3406013506,
        3773591054,
        379116347,
        1285071038,
        846784868,
        2669647154,
        3771962079,
        3550491691,
        2305946142,
        453669953,
        1268987020,
        3317592352,
        3279303384,
        3744833421,
        2610507566,
        3859509063,
        266596637,
        3847019092,
        517658769,
        3462560207,
        3443424879,
        370717030,
        4247526661,
        2224018117,
        4143653529,
        4112773975,
        2788324899,
        2477274417,
        1456262402,
        2901442914,
        1517677493,
        1846949527,
        2295493580,
        3734397586,
        2176403920,
        1280348187,
        1908823572,
        3871786941,
        846861322,
        1172426758,
        3287448474,
        3383383037,
        1655181056,
        3139813346,
        901632758,
        1897031941,
        2986607138,
        3066810236,
        3447102507,
        1393639104,
        373351379,
        950779232,
        625454576,
        3124240540,
        4148612726,
        2007998917,
        544563296,
        2244738638,
        2330496472,
        2058025392,
        1291430526,
        424198748,
        50039436,
        29584100,
        3605783033,
        2429876329,
        2791104160,
        1057563949,
        3255363231,
        3075367218,
        3463963227,
        1469046755,
        985887462
      ];
      var C_ORIG = [
        1332899944,
        1700884034,
        1701343084,
        1684370003,
        1668446532,
        1869963892
      ];
      function _encipher(lr, off, P, S) {
        var n, l = lr[off], r = lr[off + 1];
        l ^= P[0];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[1];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[2];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[3];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[4];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[5];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[6];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[7];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[8];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[9];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[10];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[11];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[12];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[13];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[14];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[15];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[16];
        lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
        lr[off + 1] = l;
        return lr;
      }
      function _streamtoword(data, offp) {
        for (var i = 0, word = 0; i < 4; ++i)
          word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
        return { key: word, offp };
      }
      function _key(key, P, S) {
        var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
        for (var i = 0; i < plen; i++)
          sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
        for (i = 0; i < plen; i += 2)
          lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
        for (i = 0; i < slen; i += 2)
          lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
      }
      function _ekskey(data, key, P, S) {
        var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
        for (var i = 0; i < plen; i++)
          sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
        offp = 0;
        for (i = 0; i < plen; i += 2)
          sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
        for (i = 0; i < slen; i += 2)
          sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
      }
      function _crypt(b, salt, rounds, callback, progressCallback) {
        var cdata = C_ORIG.slice(), clen = cdata.length, err;
        if (rounds < 4 || rounds > 31) {
          err = Error("Illegal number of rounds (4-31): " + rounds);
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        if (salt.length !== BCRYPT_SALT_LEN) {
          err = Error("Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN);
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        rounds = 1 << rounds >>> 0;
        var P, S, i = 0, j;
        if (Int32Array) {
          P = new Int32Array(P_ORIG);
          S = new Int32Array(S_ORIG);
        } else {
          P = P_ORIG.slice();
          S = S_ORIG.slice();
        }
        _ekskey(salt, b, P, S);
        function next() {
          if (progressCallback)
            progressCallback(i / rounds);
          if (i < rounds) {
            var start = Date.now();
            for (; i < rounds; ) {
              i = i + 1;
              _key(b, P, S);
              _key(salt, P, S);
              if (Date.now() - start > MAX_EXECUTION_TIME)
                break;
            }
          } else {
            for (i = 0; i < 64; i++)
              for (j = 0; j < clen >> 1; j++)
                _encipher(cdata, j << 1, P, S);
            var ret = [];
            for (i = 0; i < clen; i++)
              ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
            if (callback) {
              callback(null, ret);
              return;
            } else
              return ret;
          }
          if (callback)
            nextTick(next);
        }
        if (typeof callback !== "undefined") {
          next();
        } else {
          var res;
          while (true)
            if (typeof (res = next()) !== "undefined")
              return res || [];
        }
      }
      function _hash(s, salt, callback, progressCallback) {
        var err;
        if (typeof s !== "string" || typeof salt !== "string") {
          err = Error("Invalid string / salt: Not a string");
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        var minor, offset;
        if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
          err = Error("Invalid salt version: " + salt.substring(0, 2));
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        if (salt.charAt(2) === "$")
          minor = String.fromCharCode(0), offset = 3;
        else {
          minor = salt.charAt(2);
          if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
            err = Error("Invalid salt revision: " + salt.substring(2, 4));
            if (callback) {
              nextTick(callback.bind(this, err));
              return;
            } else
              throw err;
          }
          offset = 4;
        }
        if (salt.charAt(offset + 2) > "$") {
          err = Error("Missing salt rounds");
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
        s += minor >= "a" ? "\0" : "";
        var passwordb = stringToBytes(s), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
        function finish(bytes) {
          var res = [];
          res.push("$2");
          if (minor >= "a")
            res.push(minor);
          res.push("$");
          if (rounds < 10)
            res.push("0");
          res.push(rounds.toString());
          res.push("$");
          res.push(base64_encode(saltb, saltb.length));
          res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
          return res.join("");
        }
        if (typeof callback == "undefined")
          return finish(_crypt(passwordb, saltb, rounds));
        else {
          _crypt(passwordb, saltb, rounds, function(err2, bytes) {
            if (err2)
              callback(err2, null);
            else
              callback(null, finish(bytes));
          }, progressCallback);
        }
      }
      bcrypt.encodeBase64 = base64_encode;
      bcrypt.decodeBase64 = base64_decode;
      return bcrypt;
    });
  }
});

// node_modules/bcryptjs/index.js
var require_bcryptjs = __commonJS({
  "node_modules/bcryptjs/index.js"(exports, module) {
    module.exports = require_bcrypt();
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

// src/services/sqlite/Database.ts
init_paths();
init_logger();
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
function createSummary(db, sessionId, project, request2, investigated, learned, completed, nextSteps, notes) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO summaries 
     (session_id, project, request, investigated, learned, completed, next_steps, notes, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, project, request2, investigated, learned, completed, nextSteps, notes, now.toISOString(), now.getTime()]
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
init_ImportExport();

// src/types/worker-types.ts
var KNOWLEDGE_TYPES = ["constraint", "decision", "heuristic", "rejected"];

// src/services/sqlite/Retention.ts
var KNOWLEDGE_TYPE_LIST = KNOWLEDGE_TYPES;
var KNOWLEDGE_PLACEHOLDERS = KNOWLEDGE_TYPE_LIST.map(() => "?").join(", ");

// src/services/sqlite/Backup.ts
init_logger();
import {
  existsSync as existsSync4,
  mkdirSync as mkdirSync3,
  copyFileSync,
  readdirSync,
  statSync as statSync3,
  unlinkSync,
  readFileSync as readFileSync2,
  writeFileSync
} from "fs";
import { join as join3, basename as basename2 } from "path";
function formatTimestamp(date) {
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const secs = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${year}-${month}-${day}-${hours}${mins}${secs}-${ms}`;
}
function resolveUniqueBackupTarget(backupDir, baseDate) {
  for (let attempt = 0; attempt < 1e4; attempt++) {
    const date = new Date(baseDate.getTime() + attempt);
    const ts = formatTimestamp(date);
    const filename = `backup-${ts}.db`;
    const filePath = join3(backupDir, filename);
    const metaPath = join3(backupDir, `backup-${ts}.meta.json`);
    if (!existsSync4(filePath) && !existsSync4(metaPath)) {
      return { date, filename, filePath, metaPath };
    }
  }
  throw new Error(`Impossibile risolvere un nome backup univoco in ${backupDir}`);
}
function collectStats(db, dbPath) {
  const countTable = (table) => {
    try {
      const row = db.query(`SELECT COUNT(*) as c FROM ${table}`).get();
      return row?.c ?? 0;
    } catch {
      return 0;
    }
  };
  const dbSizeBytes = existsSync4(dbPath) ? statSync3(dbPath).size : 0;
  return {
    observations: countTable("observations"),
    sessions: countTable("sessions"),
    summaries: countTable("summaries"),
    prompts: countTable("prompts"),
    dbSizeBytes
  };
}
function getSchemaVersion(db) {
  try {
    const row = db.query("SELECT MAX(version) as v FROM schema_versions").get();
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}
function createBackup(dbPath, backupDir, db) {
  mkdirSync3(backupDir, { recursive: true });
  const { date: now, filename, filePath: destPath, metaPath } = resolveUniqueBackupTarget(backupDir, /* @__PURE__ */ new Date());
  if (!existsSync4(dbPath)) {
    throw new Error(`Database non trovato: ${dbPath}`);
  }
  copyFileSync(dbPath, destPath);
  logger.info("BACKUP", `File DB copiato: ${dbPath} \u2192 ${destPath}`);
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (existsSync4(walPath)) {
    copyFileSync(walPath, `${destPath}-wal`);
    logger.debug("BACKUP", "File WAL copiato");
  }
  if (existsSync4(shmPath)) {
    copyFileSync(shmPath, `${destPath}-shm`);
    logger.debug("BACKUP", "File SHM copiato");
  }
  const stats = collectStats(db, dbPath);
  const schemaVersion = getSchemaVersion(db);
  const metadata = {
    timestamp: now.toISOString(),
    timestampEpoch: now.getTime(),
    schemaVersion,
    stats,
    sourcePath: dbPath,
    filename
  };
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf8");
  logger.info("BACKUP", `Metadata scritto: ${metaPath}`);
  return {
    filePath: destPath,
    metaPath,
    metadata
  };
}
function listBackups(backupDir) {
  if (!existsSync4(backupDir)) {
    return [];
  }
  const entries = [];
  let files;
  try {
    files = readdirSync(backupDir);
  } catch (err) {
    logger.warn("BACKUP", `Impossibile leggere la directory backup: ${backupDir}`, {}, err);
    return [];
  }
  const metaFiles = files.filter((f) => f.startsWith("backup-") && f.endsWith(".meta.json"));
  for (const metaFile of metaFiles) {
    const metaPath = join3(backupDir, metaFile);
    const dbFilename = metaFile.replace(/\.meta\.json$/, ".db");
    const filePath = join3(backupDir, dbFilename);
    let metadata;
    try {
      const raw = readFileSync2(metaPath, "utf8");
      metadata = JSON.parse(raw);
    } catch (err) {
      logger.warn("BACKUP", `Metadata non leggibile: ${metaPath}`, {}, err);
      continue;
    }
    if (!existsSync4(filePath)) {
      logger.warn("BACKUP", `File backup mancante per metadata: ${filePath}`);
      continue;
    }
    entries.push({ filePath, metaPath, metadata });
  }
  entries.sort((a, b) => b.metadata.timestampEpoch - a.metadata.timestampEpoch);
  return entries;
}
function restoreBackup(backupFile, dbPath) {
  if (!existsSync4(backupFile)) {
    throw new Error(`File backup non trovato: ${backupFile}`);
  }
  copyFileSync(backupFile, dbPath);
  logger.info("BACKUP", `Database ripristinato: ${backupFile} \u2192 ${dbPath}`);
  const walBackup = `${backupFile}-wal`;
  const shmBackup = `${backupFile}-shm`;
  const walDest = `${dbPath}-wal`;
  const shmDest = `${dbPath}-shm`;
  if (existsSync4(walBackup)) {
    copyFileSync(walBackup, walDest);
    logger.debug("BACKUP", "File WAL ripristinato");
  } else if (existsSync4(walDest)) {
    unlinkSync(walDest);
    logger.debug("BACKUP", "File WAL corrente rimosso (non presente nel backup)");
  }
  if (existsSync4(shmBackup)) {
    copyFileSync(shmBackup, shmDest);
    logger.debug("BACKUP", "File SHM ripristinato");
  } else if (existsSync4(shmDest)) {
    unlinkSync(shmDest);
    logger.debug("BACKUP", "File SHM corrente rimosso (non presente nel backup)");
  }
}
function rotateBackups(backupDir, maxKeep) {
  if (maxKeep <= 0) {
    throw new Error(`maxKeep deve essere > 0, ricevuto: ${maxKeep}`);
  }
  const entries = listBackups(backupDir);
  if (entries.length <= maxKeep) {
    logger.debug("BACKUP", `Rotazione non necessaria: ${entries.length}/${maxKeep} backup presenti`);
    return 0;
  }
  const toDelete = entries.slice(maxKeep);
  let deleted = 0;
  for (const entry of toDelete) {
    try {
      if (existsSync4(entry.filePath)) {
        unlinkSync(entry.filePath);
      }
    } catch (err) {
      logger.warn("BACKUP", `Impossibile eliminare: ${entry.filePath}`, {}, err);
    }
    for (const extra of [`${entry.filePath}-wal`, `${entry.filePath}-shm`]) {
      try {
        if (existsSync4(extra)) unlinkSync(extra);
      } catch {
      }
    }
    try {
      if (existsSync4(entry.metaPath)) {
        unlinkSync(entry.metaPath);
      }
    } catch (err) {
      logger.warn("BACKUP", `Impossibile eliminare metadata: ${entry.metaPath}`, {}, err);
    }
    logger.info("BACKUP", `Backup rimosso (rotazione): ${basename2(entry.filePath)}`);
    deleted++;
  }
  logger.info("BACKUP", `Rotazione completata: ${deleted} backup eliminati, ${maxKeep} mantenuti`);
  return deleted;
}

// src/sdk/index.ts
init_Observations();
import { createHash as createHash2 } from "crypto";
init_Search();

// src/services/search/HybridSearch.ts
init_EmbeddingService();

// src/services/search/VectorSearch.ts
init_EmbeddingService();
init_logger();
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
init_logger();
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
init_EmbeddingService();
init_logger();
var TotalRecallSDK = class {
  db;
  project;
  constructor(config = {}) {
    this.db = new TotalRecallDatabase(config.dataDir, config.skipMigrations || false);
    this.project = config.project || this.detectProject();
  }
  detectProject() {
    try {
      const { execSync: execSync4 } = __require("child_process");
      const gitRoot = execSync4("git rev-parse --show-toplevel", {
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
    return createHash2("sha256").update(payload).digest("hex");
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
    const { readFileSync: readFileSync7 } = await import("fs");
    const raw = readFileSync7(transcriptPath, "utf8");
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

// src/services/report-formatter.ts
function formatReportText(data) {
  const lines = [];
  lines.push("");
  lines.push(`  \x1B[36m\u2550\u2550\u2550 Total Recall Report \u2014 ${data.period.label} \u2550\u2550\u2550\x1B[0m`);
  lines.push(`  \x1B[2m${data.period.start} \u2192 ${data.period.end} (${data.period.days} days)\x1B[0m`);
  lines.push("");
  lines.push(`  \x1B[1mOverview\x1B[0m`);
  lines.push(`    Observations:  ${data.overview.observations}`);
  lines.push(`    Summaries:     ${data.overview.summaries}`);
  lines.push(`    Sessions:      ${data.overview.sessions}`);
  lines.push(`    Prompts:       ${data.overview.prompts}`);
  lines.push(`    Knowledge:     ${data.overview.knowledgeCount}`);
  if (data.overview.staleCount > 0) {
    lines.push(`    Stale:         ${data.overview.staleCount}`);
  }
  lines.push("");
  if (data.sessionStats.total > 0) {
    const completionPct = data.sessionStats.total > 0 ? Math.round(data.sessionStats.completed / data.sessionStats.total * 100) : 0;
    lines.push(`  \x1B[1mSessions\x1B[0m`);
    lines.push(`    Total: ${data.sessionStats.total} | Completed: ${data.sessionStats.completed} (${completionPct}%)`);
    if (data.sessionStats.avgDurationMinutes > 0) {
      lines.push(`    Avg duration: ${data.sessionStats.avgDurationMinutes} min`);
    }
    lines.push("");
  }
  if (data.timeline.length > 0) {
    lines.push(`  \x1B[1mTimeline\x1B[0m`);
    const maxCount = Math.max(...data.timeline.map((t) => t.count));
    const maxBarLen = 30;
    for (const entry of data.timeline) {
      const barLen = maxCount > 0 ? Math.round(entry.count / maxCount * maxBarLen) : 0;
      const bar = "\x1B[32m" + "\u2593".repeat(barLen) + "\x1B[0m";
      const dayShort = entry.day.substring(5);
      lines.push(`    ${dayShort}  ${bar} ${entry.count}`);
    }
    lines.push("");
  }
  if (data.typeDistribution.length > 0) {
    lines.push(`  \x1B[1mBy Type\x1B[0m`);
    for (const entry of data.typeDistribution) {
      lines.push(`    ${entry.type.padEnd(16)} ${entry.count}`);
    }
    lines.push("");
  }
  if (data.topLearnings.length > 0) {
    lines.push(`  \x1B[1mKey Learnings\x1B[0m`);
    for (const learning of data.topLearnings) {
      lines.push(`    - ${learning}`);
    }
    lines.push("");
  }
  if (data.completedTasks.length > 0) {
    lines.push(`  \x1B[1mCompleted\x1B[0m`);
    for (const task of data.completedTasks) {
      lines.push(`    - ${task}`);
    }
    lines.push("");
  }
  if (data.nextSteps.length > 0) {
    lines.push(`  \x1B[1mNext Steps\x1B[0m`);
    for (const step of data.nextSteps) {
      lines.push(`    - ${step}`);
    }
    lines.push("");
  }
  if (data.fileHotspots.length > 0) {
    lines.push(`  \x1B[1mFile Hotspots\x1B[0m`);
    for (const entry of data.fileHotspots.slice(0, 10)) {
      lines.push(`    ${entry.file} (${entry.count}x)`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function formatReportMarkdown(data) {
  const lines = [];
  lines.push(`# Total Recall Report \u2014 ${data.period.label}`);
  lines.push("");
  lines.push(`**Period**: ${data.period.start} \u2192 ${data.period.end} (${data.period.days} days)`);
  lines.push("");
  lines.push("## Overview");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|------:|");
  lines.push(`| Observations | ${data.overview.observations} |`);
  lines.push(`| Summaries | ${data.overview.summaries} |`);
  lines.push(`| Sessions | ${data.overview.sessions} |`);
  lines.push(`| Prompts | ${data.overview.prompts} |`);
  lines.push(`| Knowledge items | ${data.overview.knowledgeCount} |`);
  if (data.overview.staleCount > 0) {
    lines.push(`| Stale observations | ${data.overview.staleCount} |`);
  }
  lines.push("");
  if (data.sessionStats.total > 0) {
    const completionPct = Math.round(data.sessionStats.completed / data.sessionStats.total * 100);
    lines.push("## Sessions");
    lines.push("");
    lines.push(`- **Total**: ${data.sessionStats.total}`);
    lines.push(`- **Completed**: ${data.sessionStats.completed} (${completionPct}%)`);
    if (data.sessionStats.avgDurationMinutes > 0) {
      lines.push(`- **Avg duration**: ${data.sessionStats.avgDurationMinutes} min`);
    }
    lines.push("");
  }
  if (data.timeline.length > 0) {
    lines.push("## Activity Timeline");
    lines.push("");
    lines.push("| Date | Observations |");
    lines.push("|------|------------:|");
    for (const entry of data.timeline) {
      lines.push(`| ${entry.day} | ${entry.count} |`);
    }
    lines.push("");
  }
  if (data.typeDistribution.length > 0) {
    lines.push("## Observation Types");
    lines.push("");
    for (const entry of data.typeDistribution) {
      lines.push(`- **${entry.type}**: ${entry.count}`);
    }
    lines.push("");
  }
  if (data.topLearnings.length > 0) {
    lines.push("## Key Learnings");
    lines.push("");
    for (const learning of data.topLearnings) {
      lines.push(`- ${learning}`);
    }
    lines.push("");
  }
  if (data.completedTasks.length > 0) {
    lines.push("## Completed");
    lines.push("");
    for (const task of data.completedTasks) {
      lines.push(`- ${task}`);
    }
    lines.push("");
  }
  if (data.nextSteps.length > 0) {
    lines.push("## Next Steps");
    lines.push("");
    for (const step of data.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }
  if (data.fileHotspots.length > 0) {
    lines.push("## File Hotspots");
    lines.push("");
    lines.push("| File | Modifications |");
    lines.push("|------|-------------:|");
    for (const entry of data.fileHotspots.slice(0, 10)) {
      lines.push(`| \`${entry.file}\` | ${entry.count} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function formatReportJson(data) {
  return JSON.stringify(data, null, 2);
}

// src/cli/banner.ts
var G = [
  "\x1B[38;5;135m",
  // viola
  "\x1B[38;5;99m",
  // viola-blu
  "\x1B[38;5;63m",
  // indaco
  "\x1B[38;5;33m",
  // blu
  "\x1B[38;5;39m",
  // blu chiaro
  "\x1B[38;5;44m"
  // ciano
];
var R = "\x1B[0m";
var B = "\x1B[1m";
var D = "\x1B[2m";
var U = "\x1B[4m";
var GRN = "\x1B[32m";
var CYN = "\x1B[36m";
var LOGO = [
  " \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557     ",
  " \u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551     ",
  "    \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551     ",
  "    \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551     ",
  "    \u2588\u2588\u2551   \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D   \u2588\u2588\u2551   \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "    \u255A\u2550\u255D    \u255A\u2550\u2550\u2550\u2550\u2550\u255D    \u255A\u2550\u255D   \u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
];
var MEMORY_TAG = "         R E C A L L";
var LINE = "\u2500".repeat(48);
function supportsColor() {
  if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;
  return process.stdout.isTTY ?? false;
}
function printBanner(opts) {
  const color = supportsColor();
  const c = (code, text) => color ? `${code}${text}${R}` : text;
  console.log("");
  for (let i = 0; i < LOGO.length; i++) {
    console.log(`  ${c(G[i], LOGO[i])}`);
  }
  console.log(`  ${c(`${G[G.length - 1]}${B}`, MEMORY_TAG)}`);
  console.log("");
  console.log(`  ${c(D, LINE)}`);
  console.log("");
  console.log(`  ${c(`${GRN}${B}`, "\u2713 Installation complete!")}  v${opts.version}`);
  console.log(`  ${c(D, `Editor: ${opts.editor}`)}`);
  console.log("");
  console.log(`  ${c(`${CYN}${B}`, "Installed:")}`);
  for (const p of opts.configPaths) {
    console.log(`    ${c(D, "\u2192")} ${p}`);
  }
  console.log(`    ${c(D, "\u2192")} Data: ${opts.dataDir}`);
  console.log("");
  console.log(`  ${c(`${CYN}${B}`, "Dashboard:")}  ${c(U, opts.dashboardUrl)}`);
  console.log(`  ${c(D, "Docs:       https://auritidesign.it/docs/totalrecall/")}`);
  console.log("");
  console.log(`  ${c(D, LINE)}`);
  console.log(`  ${c(G[2], "Your AI assistant now has persistent memory.")}`);
  console.log(`  ${c(G[3], "Every session builds on the last.")}`);
  console.log(`  ${c(D, LINE)}`);
  console.log("");
}

// src/cli/contextkit.ts
init_cli_utils();
init_Observations();

// src/services/team/TeamSync.ts
import { execSync } from "node:child_process";
import { existsSync as existsSync6, mkdirSync as mkdirSync5, readFileSync as readFileSync4, writeFileSync as writeFileSync3, readdirSync as readdirSync2 } from "node:fs";
import { join as join5 } from "node:path";
import { homedir as homedir2 } from "node:os";

// src/services/team/TeamFormatter.ts
import { createHash as createHash3 } from "node:crypto";
function generateKnowledgeHash(project, title, type) {
  const input = `${project}::${type}::${title}`;
  return createHash3("sha256").update(input).digest("hex").substring(0, 12);
}
function knowledgeToMarkdown(item) {
  const hash = generateKnowledgeHash(item.project, item.title, item.type);
  const frontmatter = [
    "---",
    `id: ${hash}`,
    `type: ${item.type}`,
    `project: ${item.project}`,
    `title: ${yamlEscapeString(item.title)}`,
    `created: ${item.created_at}`,
    `importance: ${item.importance}`,
    `concepts: [${item.concepts.map((c) => yamlEscapeString(c)).join(", ")}]`
  ];
  if (item.severity) {
    frontmatter.push(`severity: ${item.severity}`);
  }
  if (item.confidence) {
    frontmatter.push(`confidence: ${item.confidence}`);
  }
  if (item.context) {
    frontmatter.push(`context: ${yamlEscapeString(item.context)}`);
  }
  frontmatter.push("---");
  const sections = [frontmatter.join("\n"), "", item.content];
  if (item.reason) {
    sections.push("", "## Reason", "", item.reason);
  }
  if (item.alternatives && item.alternatives.length > 0) {
    sections.push("", "## Alternatives", "");
    for (const alt of item.alternatives) {
      sections.push(`- ${alt}`);
    }
  }
  return sections.join("\n") + "\n";
}
function markdownToKnowledge(content, filename) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;
  const frontmatterRaw = frontmatterMatch[1] ?? "";
  const body = frontmatterMatch[2] ?? "";
  const fm = parseFrontmatter(frontmatterRaw);
  const type = fm["type"];
  const project = fm["project"];
  const title = fm["title"];
  const created = fm["created"];
  if (!type || !project || !title) return null;
  const hash = fm["id"] || generateKnowledgeHash(project, title, type);
  const importance = parseInt(fm["importance"] ?? "3", 10);
  const concepts = parseYamlArray(fm["concepts"] ?? "");
  const { mainContent, reason, alternatives } = parseBodySections(body);
  const result = {
    hash,
    type,
    project,
    title,
    content: mainContent,
    created: created || (/* @__PURE__ */ new Date()).toISOString(),
    importance,
    concepts
  };
  if (reason) result.reason = reason;
  if (alternatives.length > 0) result.alternatives = alternatives;
  if (fm["severity"]) result.severity = fm["severity"];
  if (fm["confidence"]) result.confidence = fm["confidence"];
  if (fm["context"]) result.context = fm["context"];
  return result;
}
function generateFilename(project, title, type) {
  const hash = generateKnowledgeHash(project, title, type);
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 50);
  return `${hash}-${safeTitle}.md`;
}
function yamlEscapeString(value) {
  if (/[:#\[\]{},&*!|>'"@`]/.test(value) || value.includes("\n")) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
function parseFrontmatter(raw) {
  const result = {};
  for (const line of raw.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.substring(0, colonIdx).trim();
    let value = line.substring(colonIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}
function parseYamlArray(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[]") return [];
  const inner = trimmed.startsWith("[") ? trimmed.slice(1, -1) : trimmed;
  return inner.split(",").map((s) => {
    let item = s.trim();
    if (item.startsWith('"') && item.endsWith('"') || item.startsWith("'") && item.endsWith("'")) {
      item = item.slice(1, -1);
    }
    return item;
  }).filter(Boolean);
}
function parseBodySections(body) {
  const lines = body.split("\n");
  let mainContent = "";
  let reason;
  const alternatives = [];
  let currentSection = "main";
  for (const line of lines) {
    if (line.trim() === "## Reason") {
      currentSection = "reason";
      continue;
    }
    if (line.trim() === "## Alternatives") {
      currentSection = "alternatives";
      continue;
    }
    switch (currentSection) {
      case "main":
        mainContent += line + "\n";
        break;
      case "reason":
        if (reason === void 0) reason = "";
        reason += line + "\n";
        break;
      case "alternatives":
        if (line.trim().startsWith("- ")) {
          alternatives.push(line.trim().substring(2));
        }
        break;
    }
  }
  return {
    mainContent: mainContent.trim(),
    reason: reason?.trim() || void 0,
    alternatives
  };
}

// src/services/team/TeamSync.ts
var TEAM_CONFIG_DIR = join5(homedir2(), ".totalrecall");
var TEAM_CONFIG_PATH = join5(TEAM_CONFIG_DIR, "team.json");
var DEFAULT_LOCAL_PATH = join5(TEAM_CONFIG_DIR, "team-repo");
var KNOWLEDGE_DIR_NAME = "knowledge";
var KNOWLEDGE_TYPES2 = ["constraint", "decision", "heuristic", "rejected"];
function loadTeamConfig() {
  if (!existsSync6(TEAM_CONFIG_PATH)) return null;
  try {
    const raw = readFileSync4(TEAM_CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveTeamConfig(config) {
  if (!existsSync6(TEAM_CONFIG_DIR)) {
    mkdirSync5(TEAM_CONFIG_DIR, { recursive: true });
  }
  writeFileSync3(TEAM_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}
function initTeamConfig(repoUrl, options) {
  const localPath = options?.localPath ?? DEFAULT_LOCAL_PATH;
  const syncInterval = options?.syncInterval ?? 60;
  if (!existsSync6(localPath)) {
    mkdirSync5(localPath, { recursive: true });
    try {
      execSync(`git clone "${repoUrl}" "${localPath}"`, { stdio: "pipe", encoding: "utf8" });
    } catch {
      execSync("git init", { cwd: localPath, stdio: "pipe" });
      execSync(`git remote add origin "${repoUrl}"`, { cwd: localPath, stdio: "pipe" });
    }
  }
  const knowledgeDir = join5(localPath, KNOWLEDGE_DIR_NAME);
  if (!existsSync6(knowledgeDir)) {
    mkdirSync5(knowledgeDir, { recursive: true });
  }
  const config = {
    repoUrl,
    localPath,
    syncInterval,
    lastSync: null,
    minImportance: 3
  };
  saveTeamConfig(config);
  return config;
}
function exportKnowledge(db, targetDir, minImportance = 3) {
  const knowledgeDir = join5(targetDir, KNOWLEDGE_DIR_NAME);
  if (!existsSync6(knowledgeDir)) {
    mkdirSync5(knowledgeDir, { recursive: true });
  }
  const placeholders = KNOWLEDGE_TYPES2.map(() => "?").join(",");
  const rows = db.query(
    `SELECT * FROM observations WHERE type IN (${placeholders}) ORDER BY created_at_epoch DESC`
  ).all(...KNOWLEDGE_TYPES2);
  let exported = 0;
  for (const row of rows) {
    const item = observationToExportItem(row);
    if (item.importance < minImportance) continue;
    const filename = generateFilename(item.project, item.title, item.type);
    const filepath = join5(knowledgeDir, filename);
    const markdown = knowledgeToMarkdown(item);
    writeFileSync3(filepath, markdown, "utf8");
    exported++;
  }
  return exported;
}
function observationToExportItem(obs) {
  let metadata = {};
  if (obs.facts) {
    try {
      metadata = JSON.parse(obs.facts);
    } catch {
    }
  }
  const importance = typeof metadata.importance === "number" ? metadata.importance : 3;
  const concepts = obs.concepts ? obs.concepts.split(",").map((c) => c.trim()).filter(Boolean) : [];
  const item = {
    id: obs.id,
    type: obs.type,
    project: obs.project,
    title: obs.title,
    content: obs.text || "",
    created_at: obs.created_at,
    importance,
    concepts
  };
  if ("reason" in metadata && metadata.reason) {
    item.reason = metadata.reason;
  }
  if ("alternatives" in metadata && Array.isArray(metadata.alternatives)) {
    item.alternatives = metadata.alternatives;
  }
  if ("severity" in metadata && metadata.severity) {
    item.severity = metadata.severity;
  }
  if ("confidence" in metadata && metadata.confidence) {
    item.confidence = metadata.confidence;
  }
  if ("context" in metadata && metadata.context) {
    item.context = metadata.context;
  }
  return item;
}
function importKnowledge(db, sourceDir) {
  const knowledgeDir = join5(sourceDir, KNOWLEDGE_DIR_NAME);
  if (!existsSync6(knowledgeDir)) {
    return { exported: 0, imported: 0, conflicts: [], errors: [] };
  }
  const files = readdirSync2(knowledgeDir).filter((f) => f.endsWith(".md"));
  const result = { exported: 0, imported: 0, conflicts: [], errors: [] };
  for (const file of files) {
    const filepath = join5(knowledgeDir, file);
    try {
      const content = readFileSync4(filepath, "utf8");
      const item = markdownToKnowledge(content, file);
      if (!item) {
        result.errors.push(`${file}: invalid format`);
        continue;
      }
      const existingHash = generateKnowledgeHash(item.project, item.title, item.type);
      const existing = findKnowledgeByHash(db, item.project, item.title, item.type);
      if (existing) {
        result.conflicts.push(`${file}: "${item.title}" already exists locally (local wins)`);
        continue;
      }
      insertKnowledgeFromImport(db, item);
      result.imported++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`${file}: ${msg}`);
    }
  }
  return result;
}
function findKnowledgeByHash(db, project, title, type) {
  const row = db.query(
    "SELECT id FROM observations WHERE project = ? AND title = ? AND type = ? LIMIT 1"
  ).get(project, title, type);
  return !!row;
}
function insertKnowledgeFromImport(db, item) {
  const metadata = {
    knowledgeType: item.type,
    importance: item.importance
  };
  if (item.reason) metadata["reason"] = item.reason;
  if (item.alternatives) metadata["alternatives"] = item.alternatives;
  if (item.severity) metadata["severity"] = item.severity;
  if (item.confidence) metadata["confidence"] = item.confidence;
  if (item.context) metadata["context"] = item.context;
  const now = /* @__PURE__ */ new Date();
  const createdAt = item.created || now.toISOString();
  const createdAtEpoch = new Date(createdAt).getTime() || now.getTime();
  const conceptsStr = item.concepts.length > 0 ? item.concepts.join(", ") : null;
  db.run(
    `INSERT INTO observations
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens, auto_category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `team-sync-${Date.now()}`,
      item.project,
      item.type,
      item.title,
      null,
      item.content,
      null,
      JSON.stringify(metadata),
      conceptsStr,
      null,
      null,
      0,
      createdAt,
      createdAtEpoch,
      null,
      0,
      "knowledge"
    ]
  );
}
function git(localPath, command2) {
  return execSync(`git ${command2}`, {
    cwd: localPath,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
}
function hasLocalChanges(localPath) {
  const status2 = git(localPath, "status --porcelain");
  return status2.length > 0;
}
function pushKnowledge(db, config) {
  const result = { exported: 0, imported: 0, conflicts: [], errors: [] };
  try {
    result.exported = exportKnowledge(db, config.localPath, config.minImportance);
    if (result.exported === 0 && !hasLocalChanges(config.localPath)) {
      return result;
    }
    git(config.localPath, "add -A");
    if (hasLocalChanges(config.localPath)) {
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 19);
      git(config.localPath, `commit -m "team-sync: export ${result.exported} items (${timestamp})"`);
    }
    try {
      git(config.localPath, "push origin HEAD");
    } catch (pushErr) {
      const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
      result.errors.push(`Push failed: ${msg}`);
    }
    config.lastSync = (/* @__PURE__ */ new Date()).toISOString();
    saveTeamConfig(config);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Export failed: ${msg}`);
  }
  return result;
}
function pullKnowledge(db, config) {
  const result = { exported: 0, imported: 0, conflicts: [], errors: [] };
  try {
    try {
      git(config.localPath, "pull origin HEAD --rebase");
    } catch (pullErr) {
      const msg = pullErr instanceof Error ? pullErr.message : String(pullErr);
      if (!msg.includes("Couldn't find remote ref") && !msg.includes("no tracking information")) {
        result.errors.push(`Pull failed: ${msg}`);
        return result;
      }
    }
    const importResult = importKnowledge(db, config.localPath);
    result.imported = importResult.imported;
    result.conflicts = importResult.conflicts;
    result.errors.push(...importResult.errors);
    config.lastSync = (/* @__PURE__ */ new Date()).toISOString();
    saveTeamConfig(config);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Pull failed: ${msg}`);
  }
  return result;
}
function getTeamStatus(config) {
  const knowledgeDir = join5(config.localPath, KNOWLEDGE_DIR_NAME);
  let localKnowledgeCount = 0;
  if (existsSync6(knowledgeDir)) {
    localKnowledgeCount = readdirSync2(knowledgeDir).filter((f) => f.endsWith(".md")).length;
  }
  return {
    configured: true,
    repoUrl: config.repoUrl,
    localPath: config.localPath,
    lastSync: config.lastSync,
    syncInterval: config.syncInterval,
    localKnowledgeCount
  };
}

// src/cli/contextkit.ts
init_paths();
import { execSync as execSync3 } from "child_process";
import { existsSync as existsSync8, mkdirSync as mkdirSync7, readFileSync as readFileSync6, writeFileSync as writeFileSync5, appendFileSync as appendFileSync2, unlinkSync as unlinkSync3 } from "fs";
import { join as join7, dirname as dirname3, basename as basename3 } from "path";
import { homedir as homedir4, platform, release } from "os";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createInterface } from "readline";
import * as http from "http";
var args = process.argv.slice(2);
var command = args[0];
var binName = basename3(process.argv[1] ?? "");
if (binName === "kiro-memory") {
  console.error('Note: "kiro-memory" is a legacy alias. The canonical command is "totalrecall".\n');
}
var __filename = fileURLToPath2(import.meta.url);
var __dirname2 = dirname3(__filename);
var DIST_DIR = dirname3(__dirname2);
var PKG_VERSION = "unknown";
try {
  const pkgPath = join7(DIST_DIR, "..", "..", "package.json");
  PKG_VERSION = JSON.parse(readFileSync6(pkgPath, "utf8")).version;
} catch {
}
var AGENT_TEMPLATE = JSON.stringify({
  name: "totalrecall",
  description: "Agent with persistent cross-session memory. Uses Total Recall to remember context from previous sessions and automatically save what it learns.",
  model: "claude-sonnet-4",
  tools: ["read", "write", "shell", "glob", "grep", "web_search", "web_fetch", "@totalrecall"],
  mcpServers: {
    "totalrecall": {
      command: "node",
      args: ["__DIST_DIR__/servers/mcp-server.js"]
    }
  },
  hooks: {
    agentSpawn: [{ command: "node __DIST_DIR__/hooks/agentSpawn.js", timeout_ms: 1e4 }],
    userPromptSubmit: [{ command: "node __DIST_DIR__/hooks/userPromptSubmit.js", timeout_ms: 5e3 }],
    postToolUse: [{ command: "node __DIST_DIR__/hooks/postToolUse.js", matcher: "*", timeout_ms: 5e3 }],
    stop: [{ command: "node __DIST_DIR__/hooks/stop.js", timeout_ms: 1e4 }]
  },
  resources: ["file://.kiro/steering/totalrecall.md"]
}, null, 2);
var STEERING_CONTENT = `# Total Recall - Persistent Memory

You have access to Total Recall, a persistent cross-session memory system.

## Available MCP Tools

### @totalrecall/search
Search previous session memory. Use when:
- The user mentions past work
- You need context on previous decisions
- You want to check if a problem was already addressed

### @totalrecall/get_context
Retrieve recent context for the current project. Use at the start of complex tasks to understand what was done before.

### @totalrecall/timeline
Show chronological context around an observation. Use to understand the sequence of events.

### @totalrecall/get_observations
Retrieve full details of specific observations. Use after \`search\` to drill down.

## Behavior

- Previous session context is automatically injected at startup
- Your actions (files written, commands run) are tracked automatically
- A summary is generated at the end of each session
- No manual saving needed: the system is fully automatic
`;
function isWSL() {
  try {
    const rel = release().toLowerCase();
    if (rel.includes("microsoft") || rel.includes("wsl")) return true;
    if (existsSync8("/proc/version")) {
      const proc = readFileSync6("/proc/version", "utf8").toLowerCase();
      return proc.includes("microsoft") || proc.includes("wsl");
    }
    return false;
  } catch {
    return false;
  }
}
function commandExists(cmd) {
  try {
    execSync3(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function isWindowsPath(p) {
  return p.startsWith("/mnt/c") || p.startsWith("/mnt/d") || /^[A-Za-z]:[\\\/]/.test(p);
}
function runEnvironmentChecks() {
  const checks = [];
  const wsl = isWSL();
  const os = platform();
  checks.push({
    name: "Operating system",
    ok: os === "linux" || os === "darwin",
    message: os === "linux" ? wsl ? "Linux (WSL)" : "Linux" : os === "darwin" ? "macOS" : `${os} (not officially supported)`
  });
  if (wsl) {
    const nodePath = process.execPath;
    const nodeOnWindows = isWindowsPath(nodePath);
    checks.push({
      name: "WSL: Native Node.js",
      ok: !nodeOnWindows,
      message: nodeOnWindows ? `Node.js points to Windows: ${nodePath}` : `Native Linux Node.js: ${nodePath}`,
      fix: nodeOnWindows ? "Install Node.js inside WSL:\n  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n  sudo apt-get install -y nodejs\n  Or use nvm: https://github.com/nvm-sh/nvm" : void 0
    });
    try {
      const npmPrefix = execSync3("npm prefix -g", { encoding: "utf8" }).trim();
      const prefixOnWindows = isWindowsPath(npmPrefix);
      checks.push({
        name: "WSL: npm global prefix",
        ok: !prefixOnWindows,
        message: prefixOnWindows ? `npm global prefix points to Windows: ${npmPrefix}` : `npm global prefix: ${npmPrefix}`,
        fix: prefixOnWindows ? `Fix npm prefix:
  mkdir -p ~/.npm-global
  npm config set prefix ~/.npm-global
  echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
  source ~/.bashrc
  Then reinstall: npm install -g totalrecall` : void 0
      });
    } catch {
      checks.push({
        name: "WSL: npm global prefix",
        ok: false,
        message: "Unable to determine npm prefix"
      });
    }
    try {
      const npmPath = execSync3("which npm", { encoding: "utf8" }).trim();
      const npmOnWindows = isWindowsPath(npmPath);
      checks.push({
        name: "WSL: npm binary",
        ok: !npmOnWindows,
        message: npmOnWindows ? `npm is the Windows version: ${npmPath}` : `Native Linux npm: ${npmPath}`,
        fix: npmOnWindows ? "Your npm binary is the Windows version running inside WSL.\n  This causes EPERM/UNC errors when installing packages.\n  Install Node.js (includes npm) natively in WSL:\n    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\n    source ~/.bashrc\n    nvm install 22\n  Or:\n    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n    sudo apt-get install -y nodejs" : void 0
      });
    } catch {
    }
  }
  const nodeVersion = parseInt(process.versions.node.split(".")[0]);
  checks.push({
    name: "Node.js >= 18",
    ok: nodeVersion >= 18,
    message: `Node.js v${process.versions.node}`,
    fix: nodeVersion < 18 ? "Upgrade Node.js:\n  nvm install 22 && nvm use 22\n  Or visit: https://nodejs.org/" : void 0
  });
  let sqliteOk = false;
  let sqliteMsg = "";
  try {
    __require("better-sqlite3");
    sqliteOk = true;
    sqliteMsg = "Native module loaded successfully";
  } catch (err) {
    sqliteMsg = err.code === "ERR_DLOPEN_FAILED" ? "Incompatible native binary (invalid ELF header \u2014 likely platform mismatch)" : `Error: ${err.message}`;
  }
  checks.push({
    name: "better-sqlite3",
    ok: sqliteOk,
    message: sqliteMsg,
    fix: !sqliteOk ? wsl ? "In WSL, rebuild the native module:\n  npm rebuild better-sqlite3\n  If that fails, reinstall:\n  npm install -g totalrecall --build-from-source" : "Rebuild the native module:\n  npm rebuild better-sqlite3" : void 0
  });
  if (os === "linux") {
    const hasMake = commandExists("make");
    const hasGcc = commandExists("g++") || commandExists("gcc");
    const hasPython = commandExists("python3") || commandExists("python");
    const allPresent = hasMake && hasGcc && hasPython;
    const missing = [];
    if (!hasMake || !hasGcc) missing.push("build-essential");
    if (!hasPython) missing.push("python3");
    checks.push({
      name: "Build tools (native modules)",
      ok: allPresent,
      message: allPresent ? "make, g++, python3 available" : `Missing: ${missing.join(", ")}`,
      fix: !allPresent ? `Install required packages:
  sudo apt-get update && sudo apt-get install -y ${missing.join(" ")}
  Then reinstall: npm install -g totalrecall --build-from-source` : void 0
    });
  }
  return checks;
}
function printChecks(checks) {
  let hasErrors = false;
  console.log("");
  for (const check of checks) {
    const icon = check.ok ? "\x1B[32m\u2713\x1B[0m" : "\x1B[31m\u2717\x1B[0m";
    console.log(`  ${icon} ${check.name}: ${check.message}`);
    if (!check.ok && check.fix) {
      console.log(`    \x1B[33m\u2192 Fix:\x1B[0m`);
      for (const line of check.fix.split("\n")) {
        console.log(`      ${line}`);
      }
    }
    if (!check.ok) hasErrors = true;
  }
  console.log("");
  return { hasErrors };
}
function askUser(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}
function detectShellRc() {
  const shell = process.env.SHELL || "/bin/bash";
  if (shell.includes("zsh")) return { name: "zsh", rcFile: join7(homedir4(), ".zshrc") };
  if (shell.includes("fish")) return { name: "fish", rcFile: join7(homedir4(), ".config/fish/config.fish") };
  return { name: "bash", rcFile: join7(homedir4(), ".bashrc") };
}
var AUTOFIXABLE_CHECKS = /* @__PURE__ */ new Set([
  "WSL: npm global prefix",
  "WSL: npm binary",
  "Build tools (native modules)",
  "better-sqlite3"
]);
async function tryAutoFix(failedChecks) {
  const fixable = failedChecks.filter((c) => !c.ok && AUTOFIXABLE_CHECKS.has(c.name));
  if (fixable.length === 0) return { fixed: false, needsRestart: false };
  const { rcFile } = detectShellRc();
  let anyFixed = false;
  let needsRestart = false;
  console.log(`  \x1B[36mFound ${fixable.length} issue(s) that can be fixed automatically:\x1B[0m
`);
  for (const check of fixable) {
    console.log(`    - ${check.name}: ${check.message}`);
  }
  console.log("");
  const answer = await askUser("  Fix automatically? [Y/n] ");
  if (answer !== "" && answer !== "y" && answer !== "yes") {
    console.log("\n  Skipped auto-fix. Fix manually and run: totalrecall install\n");
    return { fixed: false, needsRestart: false };
  }
  console.log("");
  const prefixCheck = fixable.find((c) => c.name === "WSL: npm global prefix");
  if (prefixCheck) {
    console.log("  Fixing npm global prefix...");
    try {
      const npmGlobalDir = join7(homedir4(), ".npm-global");
      mkdirSync7(npmGlobalDir, { recursive: true });
      const { spawnSync: spawnNpmConfig } = __require("child_process");
      spawnNpmConfig("npm", ["config", "set", "prefix", npmGlobalDir], { stdio: "ignore" });
      const exportLine = 'export PATH="$HOME/.npm-global/bin:$PATH"';
      let alreadyInRc = false;
      if (existsSync8(rcFile)) {
        const content = readFileSync6(rcFile, "utf8");
        alreadyInRc = content.includes(".npm-global/bin");
      }
      if (!alreadyInRc) {
        appendFileSync2(rcFile, `
# npm global prefix (added by totalrecall)
${exportLine}
`);
      }
      process.env.PATH = `${npmGlobalDir}/bin:${process.env.PATH}`;
      console.log(`  \x1B[32m\u2713\x1B[0m npm prefix set to ${npmGlobalDir}`);
      console.log(`  \x1B[32m\u2713\x1B[0m PATH updated in ${rcFile}`);
      anyFixed = true;
    } catch (err) {
      console.log(`  \x1B[31m\u2717\x1B[0m Could not fix npm prefix: ${err.message}`);
    }
  }
  const npmBinaryCheck = fixable.find((c) => c.name === "WSL: npm binary");
  if (npmBinaryCheck) {
    console.log("\n  Fixing npm binary (installing nvm + Node.js 22)...");
    const nvmDir = join7(homedir4(), ".nvm");
    try {
      if (existsSync8(nvmDir)) {
        console.log(`  nvm already installed at ${nvmDir}`);
      } else {
        console.log("  Downloading nvm...");
        execSync3("curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash", {
          stdio: "inherit",
          timeout: 6e4
        });
        console.log(`  \x1B[32m\u2713\x1B[0m nvm installed`);
      }
      console.log("  Installing Node.js 22 via nvm...");
      execSync3('bash -c "source $HOME/.nvm/nvm.sh && nvm install 22"', {
        stdio: "inherit",
        timeout: 12e4
      });
      console.log(`  \x1B[32m\u2713\x1B[0m Node.js 22 installed`);
      anyFixed = true;
      needsRestart = true;
    } catch (err) {
      console.log(`  \x1B[31m\u2717\x1B[0m Could not install nvm/Node: ${err.message}`);
      console.log("  Install manually:");
      console.log("    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash");
      console.log("    source ~/.bashrc");
      console.log("    nvm install 22");
    }
  }
  const buildCheck = fixable.find((c) => c.name === "Build tools (native modules)");
  if (buildCheck) {
    console.log("\n  Fixing build tools (requires sudo)...");
    try {
      execSync3("sudo apt-get update -qq && sudo apt-get install -y build-essential python3", {
        stdio: "inherit",
        timeout: 12e4
      });
      console.log(`  \x1B[32m\u2713\x1B[0m Build tools installed`);
      anyFixed = true;
    } catch (err) {
      console.log(`  \x1B[31m\u2717\x1B[0m Could not install build tools: ${err.message}`);
      console.log("  Install manually: sudo apt-get install -y build-essential python3");
    }
  }
  const sqliteCheck = fixable.find((c) => c.name === "better-sqlite3");
  if (sqliteCheck) {
    console.log("\n  Rebuilding better-sqlite3...");
    try {
      const { spawnSync: spawnRebuild } = __require("child_process");
      const globalDirResult = spawnRebuild("npm", ["prefix", "-g"], { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
      const globalDir = (globalDirResult.stdout || "").trim();
      const sqlitePkg = join7(globalDir, "lib", "node_modules", "totalrecall");
      if (existsSync8(sqlitePkg)) {
        spawnRebuild("npm", ["rebuild", "better-sqlite3"], {
          cwd: sqlitePkg,
          stdio: "inherit",
          timeout: 6e4
        });
      } else {
        spawnRebuild("npm", ["rebuild", "better-sqlite3"], { stdio: "inherit", timeout: 6e4 });
      }
      console.log(`  \x1B[32m\u2713\x1B[0m better-sqlite3 rebuilt`);
      anyFixed = true;
    } catch (err) {
      console.log(`  \x1B[31m\u2717\x1B[0m Could not rebuild: ${err.message}`);
      console.log("  Try: npm install -g totalrecall --build-from-source");
    }
  }
  console.log("");
  return { fixed: anyFixed, needsRestart };
}
async function installKiro() {
  console.log("\n=== Total Recall - Installation ===\n");
  console.log("[1/4] Running environment checks...");
  let checks = runEnvironmentChecks();
  let { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33m\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m  Node.js was installed via nvm. To activate it:         \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m                                                         \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m  1. Close and reopen your terminal                      \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m  2. Run: \x1B[1mnpm install -g totalrecall\x1B[0m                     \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m  3. Run: \x1B[1mtotalrecall install\x1B[0m                            \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      checks = runEnvironmentChecks();
      ({ hasErrors } = printChecks(checks));
    }
    if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.");
      console.log("After fixing, run: totalrecall install\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const kiroDir = KIRO_CONFIG_DIR;
  const agentsDir = join7(kiroDir, "agents");
  const settingsDir = join7(kiroDir, "settings");
  const steeringDir = join7(kiroDir, "steering");
  const dataDir = DATA_DIR;
  console.log("[2/4] Installing Kiro configuration...\n");
  for (const dir of [agentsDir, settingsDir, steeringDir, dataDir]) {
    mkdirSync7(dir, { recursive: true });
  }
  const agentConfig = AGENT_TEMPLATE.replace(/__DIST_DIR__/g, distDir);
  const agentDestPath = join7(agentsDir, "totalrecall.json");
  writeFileSync5(agentDestPath, agentConfig, "utf8");
  console.log(`  \u2192 Agent config: ${agentDestPath}`);
  const mcpFilePath = join7(settingsDir, "mcp.json");
  let mcpConfig = { mcpServers: {} };
  if (existsSync8(mcpFilePath)) {
    try {
      mcpConfig = JSON.parse(readFileSync6(mcpFilePath, "utf8"));
      if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
    } catch {
    }
  }
  mcpConfig.mcpServers["totalrecall"] = {
    command: "node",
    args: [join7(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync5(mcpFilePath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpFilePath}`);
  const steeringDestPath = join7(steeringDir, "totalrecall.md");
  writeFileSync5(steeringDestPath, STEERING_CONTENT, "utf8");
  console.log(`  \u2192 Steering:     ${steeringDestPath}`);
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/4] Shell alias setup\n");
  const { rcFile } = detectShellRc();
  const aliasLine = 'alias kiro="kiro-cli --agent totalrecall"';
  let aliasAlreadySet = false;
  if (existsSync8(rcFile)) {
    const rcContent = readFileSync6(rcFile, "utf8");
    aliasAlreadySet = rcContent.includes("alias kiro=") && rcContent.includes("totalrecall");
  }
  if (aliasAlreadySet) {
    console.log(`  \x1B[32m\u2713\x1B[0m Alias already configured in ${rcFile}`);
  } else {
    console.log("  \x1B[36m\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m  Without an alias, you must type every time:            \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m    \x1B[2mkiro-cli --agent totalrecall\x1B[0m                          \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m                                                         \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m  With the alias, just type:                              \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m    \x1B[1m\x1B[32mkiro\x1B[0m                                                 \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1B[0m");
    console.log("");
    const answer = await askUser(`  Add alias to ${rcFile}? [Y/n] `);
    if (answer === "" || answer === "y" || answer === "yes") {
      try {
        appendFileSync2(rcFile, `
# Total Recall \u2014 persistent memory alias
${aliasLine}
`);
        console.log(`
  \x1B[32m\u2713\x1B[0m Alias added to ${rcFile}`);
        console.log(`  \x1B[33m\u2192\x1B[0m Run \x1B[1msource ${rcFile}\x1B[0m or open a new terminal to activate it.`);
      } catch (err) {
        console.log(`
  \x1B[31m\u2717\x1B[0m Could not write to ${rcFile}: ${err.message}`);
        console.log(`  \x1B[33m\u2192\x1B[0m Add manually: ${aliasLine}`);
      }
    } else {
      console.log(`
  Skipped. You can add it manually later:`);
      console.log(`    echo '${aliasLine}' >> ${rcFile}`);
    }
  }
  console.log("\n[4/4] Done!\n");
  printBanner({
    editor: "Kiro CLI",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `Agent:    ${agentDestPath}`,
      `MCP:      ${mcpFilePath}`,
      `Steering: ${steeringDestPath}`
    ]
  });
  console.log("  Start Kiro with memory:");
  if (aliasAlreadySet) {
    console.log("    \x1B[1mkiro\x1B[0m\n");
  } else {
    console.log("    \x1B[1mkiro-cli --agent totalrecall\x1B[0m\n");
  }
}
var CLAUDE_CODE_STEERING = `# Total Recall - Persistent Cross-Session Memory

You have access to Total Recall, a persistent cross-session memory system that remembers context across sessions.

## Available MCP Tools

### totalrecall/search
Search previous session memory. Use when:
- The user mentions past work or previous sessions
- You need context on previous decisions
- You want to check if a problem was already addressed

### totalrecall/get_context
Retrieve recent context for the current project. Use at the start of complex tasks.

### totalrecall/timeline
Show chronological context around an observation. Use to understand sequences of events.

### totalrecall/get_observations
Retrieve full details of specific observations by ID. Use after search to drill down.

## Behavior

- Previous session context is automatically injected at startup via hooks
- Your actions (files written, commands run, searches) are tracked automatically
- A summary is generated at the end of each session
- No manual saving needed: the system is fully automatic
`;
async function installClaudeCode() {
  console.log("\n=== Total Recall - Claude Code Installation ===\n");
  console.log("[1/3] Running environment checks...");
  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33mRestart your terminal and re-run: totalrecall install --claude-code\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.\n");
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the issues and retry.\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const claudeDir = join7(homedir4(), ".claude");
  const dataDir = DATA_DIR;
  console.log("[2/3] Installing Claude Code configuration...\n");
  mkdirSync7(claudeDir, { recursive: true });
  mkdirSync7(dataDir, { recursive: true });
  const settingsPath = join7(claudeDir, "settings.json");
  let settings = {};
  if (existsSync8(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync6(settingsPath, "utf8"));
    } catch {
    }
  }
  const hookMap = {
    "SessionStart": { script: "hooks/agentSpawn.js", timeout: 10 },
    "UserPromptSubmit": { script: "hooks/userPromptSubmit.js", timeout: 5 },
    "PostToolUse": { script: "hooks/postToolUse.js", timeout: 5 },
    "Stop": { script: "hooks/stop.js", timeout: 10 }
  };
  for (const [event, config] of Object.entries(hookMap)) {
    const hookEntry = {
      matcher: "",
      hooks: [{
        type: "command",
        command: `node ${join7(distDir, config.script)}`,
        timeout: config.timeout
      }]
    };
    if (!settings[event]) {
      settings[event] = [hookEntry];
    } else if (Array.isArray(settings[event])) {
      settings[event] = settings[event].filter(
        (h) => !h.hooks?.some(
          (hk) => hk.command?.includes("totalrecall") || hk.command?.includes("contextkit")
        )
      );
      settings[event].push(hookEntry);
    }
  }
  writeFileSync5(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.log(`  \u2192 Hooks config: ${settingsPath}`);
  const mcpPath = join7(homedir4(), ".mcp.json");
  let mcpConfig = {};
  if (existsSync8(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync6(mcpPath, "utf8"));
    } catch {
    }
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["totalrecall"] = {
    command: "node",
    args: [join7(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync5(mcpPath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpPath}`);
  const steeringPath = join7(claudeDir, "CLAUDE.md");
  let existingSteering = "";
  if (existsSync8(steeringPath)) {
    existingSteering = readFileSync6(steeringPath, "utf8");
  }
  if (!existingSteering.includes("Total Recall")) {
    const separator = existingSteering.length > 0 ? "\n\n---\n\n" : "";
    writeFileSync5(steeringPath, existingSteering + separator + CLAUDE_CODE_STEERING, "utf8");
    console.log(`  \u2192 Steering:     ${steeringPath}`);
  } else {
    console.log(`  \u2192 Steering:     ${steeringPath} (already configured)`);
  }
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/3] Done!\n");
  printBanner({
    editor: "Claude Code",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `Hooks:    ${settingsPath}`,
      `MCP:      ${mcpPath}`,
      `Steering: ${steeringPath}`
    ]
  });
}
async function installCursor() {
  console.log("\n=== Total Recall - Cursor Installation ===\n");
  console.log("[1/3] Running environment checks...");
  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33mRestart your terminal and re-run: totalrecall install --cursor\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.\n");
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the issues and retry.\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const cursorDir = join7(homedir4(), ".cursor");
  const dataDir = DATA_DIR;
  console.log("[2/3] Installing Cursor configuration...\n");
  mkdirSync7(cursorDir, { recursive: true });
  mkdirSync7(dataDir, { recursive: true });
  const hooksPath = join7(cursorDir, "hooks.json");
  let hooksConfig = { version: 1, hooks: {} };
  if (existsSync8(hooksPath)) {
    try {
      hooksConfig = JSON.parse(readFileSync6(hooksPath, "utf8"));
      if (!hooksConfig.hooks) hooksConfig.hooks = {};
      if (!hooksConfig.version) hooksConfig.version = 1;
    } catch {
    }
  }
  const cursorHookMap = {
    "sessionStart": "hooks/agentSpawn.js",
    "beforeSubmitPrompt": "hooks/userPromptSubmit.js",
    "afterFileEdit": "hooks/postToolUse.js",
    "afterShellExecution": "hooks/postToolUse.js",
    "afterMCPExecution": "hooks/postToolUse.js",
    "stop": "hooks/stop.js"
  };
  for (const [event, script] of Object.entries(cursorHookMap)) {
    const hookEntry = {
      command: `node ${join7(distDir, script)}`
    };
    if (!hooksConfig.hooks[event]) {
      hooksConfig.hooks[event] = [hookEntry];
    } else if (Array.isArray(hooksConfig.hooks[event])) {
      hooksConfig.hooks[event] = hooksConfig.hooks[event].filter(
        (h) => !h.command?.includes("totalrecall") && !h.command?.includes("contextkit")
      );
      hooksConfig.hooks[event].push(hookEntry);
    }
  }
  writeFileSync5(hooksPath, JSON.stringify(hooksConfig, null, 2), "utf8");
  console.log(`  \u2192 Hooks config: ${hooksPath}`);
  const mcpPath = join7(cursorDir, "mcp.json");
  let mcpConfig = {};
  if (existsSync8(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync6(mcpPath, "utf8"));
    } catch {
    }
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["totalrecall"] = {
    command: "node",
    args: [join7(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync5(mcpPath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpPath}`);
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/3] Done!\n");
  printBanner({
    editor: "Cursor",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `Hooks: ${hooksPath}`,
      `MCP:   ${mcpPath}`
    ]
  });
}
async function installWindsurf() {
  console.log("\n=== Total Recall - Windsurf Installation ===\n");
  console.log("[1/3] Running environment checks...");
  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33mRestart your terminal and re-run: totalrecall install --windsurf\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.\n");
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the issues and retry.\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const dataDir = DATA_DIR;
  console.log("[2/3] Installing Windsurf configuration...\n");
  mkdirSync7(dataDir, { recursive: true });
  const windsurfDir = join7(homedir4(), ".codeium", "windsurf");
  mkdirSync7(windsurfDir, { recursive: true });
  const mcpPath = join7(windsurfDir, "mcp_config.json");
  let mcpConfig = {};
  if (existsSync8(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync6(mcpPath, "utf8"));
    } catch {
    }
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["totalrecall"] = {
    command: "node",
    args: [join7(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync5(mcpPath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpPath}`);
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/3] Done!\n");
  printBanner({
    editor: "Windsurf",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `MCP: ${mcpPath}`
    ]
  });
  console.log("  \x1B[2mTip: Add a .windsurfrules file to your project with instructions");
  console.log("  to use the totalrecall MCP tools for persistent context.\x1B[0m\n");
}
async function installCline() {
  console.log("\n=== Total Recall - Cline Installation ===\n");
  console.log("[1/3] Running environment checks...");
  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33mRestart your terminal and re-run: totalrecall install --cline\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.\n");
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the issues and retry.\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const dataDir = DATA_DIR;
  console.log("[2/3] Installing Cline configuration...\n");
  mkdirSync7(dataDir, { recursive: true });
  const platform2 = process.platform;
  let clineSettingsDir;
  if (platform2 === "darwin") {
    clineSettingsDir = join7(homedir4(), "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
  } else {
    clineSettingsDir = join7(homedir4(), ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
  }
  mkdirSync7(clineSettingsDir, { recursive: true });
  const mcpPath = join7(clineSettingsDir, "cline_mcp_settings.json");
  let mcpConfig = {};
  if (existsSync8(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync6(mcpPath, "utf8"));
    } catch {
    }
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["totalrecall"] = {
    command: "node",
    args: [join7(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync5(mcpPath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpPath}`);
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/3] Done!\n");
  printBanner({
    editor: "Cline",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `MCP: ${mcpPath}`
    ]
  });
  console.log("  \x1B[2mTip: Add a .clinerules file to your project with instructions");
  console.log("  to use the totalrecall MCP tools for persistent context.\x1B[0m\n");
}
async function runDoctor() {
  console.log("\n=== Total Recall - Diagnostics ===");
  const checks = runEnvironmentChecks();
  const kiroDir = KIRO_CONFIG_DIR;
  const agentPath = join7(kiroDir, "agents", "totalrecall.json");
  const mcpPath = join7(kiroDir, "settings", "mcp.json");
  const dataDir = DATA_DIR;
  checks.push({
    name: "Kiro agent config",
    ok: existsSync8(agentPath),
    message: existsSync8(agentPath) ? agentPath : "Not found",
    fix: !existsSync8(agentPath) ? "Run: totalrecall install" : void 0
  });
  let mcpOk = false;
  if (existsSync8(mcpPath)) {
    try {
      const mcp = JSON.parse(readFileSync6(mcpPath, "utf8"));
      mcpOk = !!mcp.mcpServers?.["totalrecall"] || !!mcp.mcpServers?.contextkit;
    } catch {
    }
  }
  checks.push({
    name: "MCP server configured",
    ok: mcpOk,
    message: mcpOk ? "totalrecall registered in mcp.json" : "Not configured",
    fix: !mcpOk ? "Run: totalrecall install" : void 0
  });
  checks.push({
    name: "Data directory",
    ok: existsSync8(dataDir),
    message: existsSync8(dataDir) ? dataDir : "Not created (will be created on first use)"
  });
  const claudeDir = join7(homedir4(), ".claude");
  const claudeSettingsPath = join7(claudeDir, "settings.json");
  let claudeHooksOk = false;
  if (existsSync8(claudeSettingsPath)) {
    try {
      const claudeSettings = JSON.parse(readFileSync6(claudeSettingsPath, "utf8"));
      claudeHooksOk = !!(claudeSettings?.SessionStart || claudeSettings?.PostToolUse);
      if (claudeHooksOk) {
        const allSettings = JSON.stringify(claudeSettings);
        claudeHooksOk = allSettings.includes("totalrecall") || allSettings.includes("agentSpawn");
      }
    } catch {
    }
  }
  const claudeMcpPath = join7(homedir4(), ".mcp.json");
  let claudeMcpOk = false;
  if (existsSync8(claudeMcpPath)) {
    try {
      const claudeMcp = JSON.parse(readFileSync6(claudeMcpPath, "utf8"));
      claudeMcpOk = !!claudeMcp.mcpServers?.["totalrecall"];
    } catch {
    }
  }
  checks.push({
    name: "Claude Code hooks",
    ok: true,
    // Non-blocking: optional installation
    message: claudeHooksOk ? "Configured in ~/.claude/settings.json" : "Not configured (optional: run totalrecall install --claude-code)"
  });
  checks.push({
    name: "Claude Code MCP",
    ok: true,
    // Non-blocking: optional installation
    message: claudeMcpOk ? "totalrecall registered in ~/.mcp.json" : "Not configured (optional: run totalrecall install --claude-code)"
  });
  const cursorDir = join7(homedir4(), ".cursor");
  const cursorHooksPath = join7(cursorDir, "hooks.json");
  let cursorHooksOk = false;
  if (existsSync8(cursorHooksPath)) {
    try {
      const cursorHooks = JSON.parse(readFileSync6(cursorHooksPath, "utf8"));
      cursorHooksOk = !!(cursorHooks.hooks?.sessionStart || cursorHooks.hooks?.afterFileEdit);
      if (cursorHooksOk) {
        const allHooks = JSON.stringify(cursorHooks.hooks);
        cursorHooksOk = allHooks.includes("totalrecall") || allHooks.includes("agentSpawn");
      }
    } catch {
    }
  }
  const cursorMcpPath = join7(cursorDir, "mcp.json");
  let cursorMcpOk = false;
  if (existsSync8(cursorMcpPath)) {
    try {
      const cursorMcp = JSON.parse(readFileSync6(cursorMcpPath, "utf8"));
      cursorMcpOk = !!cursorMcp.mcpServers?.["totalrecall"];
    } catch {
    }
  }
  checks.push({
    name: "Cursor hooks",
    ok: true,
    // Non-blocking: optional installation
    message: cursorHooksOk ? "Configured in ~/.cursor/hooks.json" : "Not configured (optional: run totalrecall install --cursor)"
  });
  checks.push({
    name: "Cursor MCP",
    ok: true,
    // Non-blocking: optional installation
    message: cursorMcpOk ? "totalrecall registered in ~/.cursor/mcp.json" : "Not configured (optional: run totalrecall install --cursor)"
  });
  const windsurfMcpPath = join7(homedir4(), ".codeium", "windsurf", "mcp_config.json");
  let windsurfMcpOk = false;
  if (existsSync8(windsurfMcpPath)) {
    try {
      const windsurfMcp = JSON.parse(readFileSync6(windsurfMcpPath, "utf8"));
      windsurfMcpOk = !!windsurfMcp.mcpServers?.["totalrecall"];
    } catch {
    }
  }
  checks.push({
    name: "Windsurf MCP",
    ok: true,
    // Non-blocking: optional installation
    message: windsurfMcpOk ? "totalrecall registered in ~/.codeium/windsurf/mcp_config.json" : "Not configured (optional: run totalrecall install --windsurf)"
  });
  const clinePlatform = process.platform;
  let clineSettingsBase;
  if (clinePlatform === "darwin") {
    clineSettingsBase = join7(homedir4(), "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
  } else {
    clineSettingsBase = join7(homedir4(), ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
  }
  const clineMcpPath = join7(clineSettingsBase, "cline_mcp_settings.json");
  let clineMcpOk = false;
  if (existsSync8(clineMcpPath)) {
    try {
      const clineMcp = JSON.parse(readFileSync6(clineMcpPath, "utf8"));
      clineMcpOk = !!clineMcp.mcpServers?.["totalrecall"];
    } catch {
    }
  }
  checks.push({
    name: "Cline MCP",
    ok: true,
    // Non-blocking: optional installation
    message: clineMcpOk ? `totalrecall registered in cline_mcp_settings.json` : "Not configured (optional: run totalrecall install --cline)"
  });
  let workerOk = false;
  try {
    const port = process.env.TOTALRECALL_WORKER_PORT || "3001";
    execSync3(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/health`, {
      timeout: 2e3,
      encoding: "utf8"
    });
    workerOk = true;
  } catch {
  }
  checks.push({
    name: "Worker service",
    ok: true,
    // Non-blocking: starts automatically with Kiro
    message: workerOk ? "Running on port 3001" : "Not running (starts automatically with Kiro)"
  });
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    console.log("Some checks failed. Fix the issues listed above.\n");
    process.exit(1);
  } else {
    console.log("All good! Total Recall is ready.\n");
  }
}
async function main() {
  if (command === "install") {
    if (args.includes("--claude-code")) {
      await installClaudeCode();
    } else if (args.includes("--cursor")) {
      await installCursor();
    } else if (args.includes("--windsurf")) {
      await installWindsurf();
    } else if (args.includes("--cline")) {
      await installCline();
    } else {
      await installKiro();
    }
    return;
  }
  if (command === "doctor") {
    if (args.includes("--fix")) {
      await runDoctorFix();
      return;
    }
    await runDoctor();
    return;
  }
  if (command === "export") {
    const sdk2 = createTotalRecall();
    try {
      await exportObservations(sdk2, args.slice(1));
    } finally {
      sdk2.close();
    }
    return;
  }
  if (command === "import") {
    await importObservations(args.slice(1));
    return;
  }
  if (command === "stats") {
    await showStats();
    return;
  }
  if (command === "config") {
    await handleConfig(args.slice(1));
    return;
  }
  if (command === "backup") {
    await handleBackup(args.slice(1));
    return;
  }
  if (command === "share") {
    await handleShare(args.slice(1));
    return;
  }
  if (command === "worker:start" || command === "worker:stop" || command === "worker:restart" || command === "worker:status") {
    await handleWorker(command);
    return;
  }
  if (command === "service") {
    await handleService(args.slice(1));
    return;
  }
  if (command === "plugins") {
    await handlePlugins(args.slice(1));
    return;
  }
  if (command === "users") {
    await handleUsers(args.slice(1));
    return;
  }
  if (command === "team") {
    await handleTeam(args.slice(1));
    return;
  }
  const sdk = createTotalRecall();
  try {
    switch (command) {
      case "context":
      case "ctx":
        await showContext(sdk);
        break;
      case "search":
        if (args.includes("--interactive") || args.includes("-i")) {
          await searchInteractive(sdk, args.slice(1));
        } else {
          await searchContext(sdk, args[1]);
        }
        break;
      case "observations":
      case "obs":
        await showObservations(sdk, parseInt(args[1]) || 10);
        break;
      case "summaries":
      case "sum":
        await showSummaries(sdk, parseInt(args[1]) || 5);
        break;
      case "add-observation":
      case "add-obs":
        await addObservation(sdk, args[1], args.slice(2).join(" "));
        break;
      case "add-summary":
      case "add-sum":
        await addSummary(sdk, args.slice(1).join(" "));
        break;
      case "add-knowledge":
      case "add-k":
        await addKnowledge(sdk, args[1], args[2], args.slice(3).join(" "));
        break;
      case "decay":
        await handleDecay(sdk, args[1]);
        break;
      case "embeddings":
      case "emb":
        await handleEmbeddings(sdk, args.slice(1));
        break;
      case "semantic-search":
      case "sem":
        await semanticSearchCli(sdk, args[1]);
        break;
      case "resume":
        await resumeSession(sdk, args[1] ? parseInt(args[1]) : void 0);
        break;
      case "report":
        await generateReportCli(sdk, args.slice(1));
        break;
      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;
      default:
        console.log("Total Recall CLI\n");
        showHelp();
        process.exit(1);
    }
  } finally {
    sdk.close();
  }
}
async function showContext(sdk) {
  const context = await sdk.getContext();
  console.log(`
\u{1F4C1} Project: ${context.project}
`);
  console.log("\u{1F4DD} Recent Observations:");
  context.relevantObservations.slice(0, 5).forEach((obs, i) => {
    console.log(`  ${i + 1}. ${obs.title} (${new Date(obs.created_at).toLocaleDateString()})`);
    if (obs.text) {
      console.log(`     ${obs.text.substring(0, 100)}${obs.text.length > 100 ? "..." : ""}`);
    }
  });
  console.log("\n\u{1F4CA} Recent Summaries:");
  context.relevantSummaries.slice(0, 3).forEach((sum, i) => {
    console.log(`  ${i + 1}. ${sum.request || "No request"} (${new Date(sum.created_at).toLocaleDateString()})`);
    if (sum.learned) {
      console.log(`     Learned: ${sum.learned.substring(0, 100)}${sum.learned.length > 100 ? "..." : ""}`);
    }
  });
  console.log("");
}
async function searchContext(sdk, query) {
  if (!query) {
    console.error("Error: Please provide a search query");
    process.exit(1);
  }
  const results = await sdk.search(query);
  console.log(`
\u{1F50D} Search results for: "${query}"
`);
  if (results.observations.length > 0) {
    console.log(`\u{1F4CB} Observations (${results.observations.length}):`);
    results.observations.forEach((obs, i) => {
      console.log(`  ${i + 1}. ${obs.title}`);
      if (obs.text) {
        console.log(`     ${obs.text.substring(0, 150)}${obs.text.length > 150 ? "..." : ""}`);
      }
    });
  }
  if (results.summaries.length > 0) {
    console.log(`
\u{1F4CA} Summaries (${results.summaries.length}):`);
    results.summaries.forEach((sum, i) => {
      console.log(`  ${i + 1}. ${sum.request || "No request"}`);
      if (sum.learned) {
        console.log(`     ${sum.learned.substring(0, 150)}${sum.learned.length > 150 ? "..." : ""}`);
      }
    });
  }
  if (results.observations.length === 0 && results.summaries.length === 0) {
    console.log("No results found.\n");
  } else {
    console.log("");
  }
}
async function showObservations(sdk, limit) {
  const observations = await sdk.getRecentObservations(limit);
  console.log(`
\u{1F4CB} Last ${limit} Observations:
`);
  observations.forEach((obs, i) => {
    console.log(`${i + 1}. ${obs.title} [${obs.type}]`);
    console.log(`   Date: ${new Date(obs.created_at).toLocaleString()}`);
    if (obs.text) {
      console.log(`   Content: ${obs.text.substring(0, 200)}${obs.text.length > 200 ? "..." : ""}`);
    }
    console.log("");
  });
}
async function showSummaries(sdk, limit) {
  const summaries = await sdk.getRecentSummaries(limit);
  console.log(`
\u{1F4CA} Last ${limit} Summaries:
`);
  summaries.forEach((sum, i) => {
    console.log(`${i + 1}. ${sum.request || "No request"}`);
    console.log(`   Date: ${new Date(sum.created_at).toLocaleString()}`);
    if (sum.learned) {
      console.log(`   Learned: ${sum.learned}`);
    }
    if (sum.completed) {
      console.log(`   Completed: ${sum.completed}`);
    }
    if (sum.next_steps) {
      console.log(`   Next Steps: ${sum.next_steps}`);
    }
    console.log("");
  });
}
async function addObservation(sdk, title, content) {
  if (!title || !content) {
    console.error("Error: Please provide both title and content");
    process.exit(1);
  }
  const id = await sdk.storeObservation({
    type: "manual",
    title,
    content
  });
  console.log(`\u2705 Observation stored with ID: ${id}
`);
}
async function addSummary(sdk, content) {
  if (!content) {
    console.error("Error: Please provide summary content");
    process.exit(1);
  }
  const id = await sdk.storeSummary({
    learned: content
  });
  console.log(`\u2705 Summary stored with ID: ${id}
`);
}
async function addKnowledge(sdk, knowledgeType, title, content) {
  const validTypes = ["constraint", "decision", "heuristic", "rejected"];
  if (!knowledgeType || !validTypes.includes(knowledgeType)) {
    console.error(`Error: knowledge type must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }
  if (!title) {
    console.error("Error: title is required");
    process.exit(1);
  }
  if (!content) {
    console.error("Error: content is required");
    process.exit(1);
  }
  const severity = args.find((a) => a.startsWith("--severity="))?.split("=")[1];
  const alternativesRaw = args.find((a) => a.startsWith("--alternatives="))?.split("=")[1];
  const alternatives = alternativesRaw ? alternativesRaw.split(",").map((s) => s.trim()) : void 0;
  const reason = args.find((a) => a.startsWith("--reason="))?.split("=")[1];
  const context = args.find((a) => a.startsWith("--context="))?.split("=")[1];
  const confidence = args.find((a) => a.startsWith("--confidence="))?.split("=")[1];
  const conceptsRaw = args.find((a) => a.startsWith("--concepts="))?.split("=")[1];
  const concepts = conceptsRaw ? conceptsRaw.split(",").map((s) => s.trim()) : void 0;
  const filesRaw = args.find((a) => a.startsWith("--files="))?.split("=")[1];
  const files = filesRaw ? filesRaw.split(",").map((s) => s.trim()) : void 0;
  const cleanContent = content.split(" ").filter((w) => !w.startsWith("--")).join(" ");
  const id = await sdk.storeKnowledge({
    project: sdk.getProject(),
    knowledgeType,
    title,
    content: cleanContent || content,
    concepts,
    files,
    metadata: { severity, alternatives, reason, context, confidence }
  });
  console.log(`
Knowledge stored successfully.`);
  console.log(`  ID:   ${id}`);
  console.log(`  Type: ${knowledgeType}`);
  console.log(`  Title: ${title}
`);
}
async function handleEmbeddings(sdk, subArgs) {
  const subcommand = subArgs[0];
  switch (subcommand) {
    case "stats": {
      const stats = sdk.getEmbeddingStats();
      console.log("\nEmbedding Statistics:\n");
      console.log(`  Total observations:  ${stats.total}`);
      console.log(`  With embeddings:     ${stats.embedded}`);
      console.log(`  Coverage:            ${stats.percentage}%`);
      await sdk.initializeEmbeddings();
      const { getEmbeddingService: getEmbeddingService2 } = await Promise.resolve().then(() => (init_EmbeddingService(), EmbeddingService_exports));
      const embService = getEmbeddingService2();
      console.log(`  Provider:            ${embService.getProvider() || "none"}`);
      console.log(`  Dimensions:          ${embService.getDimensions()}`);
      console.log(`  Available:           ${embService.isAvailable() ? "yes" : "no"}`);
      if (stats.percentage < 100 && stats.total > 0) {
        console.log(`
  Run 'totalrecall embeddings backfill' to generate missing embeddings.`);
      }
      console.log("");
      break;
    }
    case "backfill": {
      const isAll = subArgs.includes("--all");
      const sizeArg = subArgs.find((a) => !a.startsWith("-") && a !== "backfill");
      const batchSize = parseInt(sizeArg || "") || (isAll ? 500 : 50);
      const available = await sdk.initializeEmbeddings();
      if (!available) {
        console.log("\n  No embedding provider available.");
        console.log("  Install fastembed or @huggingface/transformers:");
        console.log("    npm install fastembed");
        console.log("    npm install @huggingface/transformers\n");
        process.exit(1);
      }
      if (!isAll) {
        console.log(`
Generating embeddings (batch size: ${batchSize})...
`);
        const count = await sdk.backfillEmbeddings(batchSize);
        console.log(`  Generated ${count} embeddings.
`);
        const stats = sdk.getEmbeddingStats();
        console.log(`  Coverage: ${stats.embedded}/${stats.total} (${stats.percentage}%)
`);
        break;
      }
      const startStats = sdk.getEmbeddingStats();
      const missing = startStats.total - startStats.embedded;
      if (missing <= 0) {
        console.log("\n  All observations already have embeddings (100% coverage).\n");
        break;
      }
      console.log(`
  Backfill --all: ${missing} embeddings to generate (batch size: ${batchSize})`);
      console.log(`  Estimated time: ~${Math.ceil(missing / 160)} minutes
`);
      let totalGenerated = 0;
      const startTime = Date.now();
      while (true) {
        const count = await sdk.backfillEmbeddings(batchSize);
        if (count === 0) break;
        totalGenerated += count;
        const stats = sdk.getEmbeddingStats();
        const elapsed = Math.floor((Date.now() - startTime) / 1e3);
        const rate = totalGenerated / (elapsed || 1);
        const remaining = stats.total - stats.embedded;
        const eta = remaining > 0 ? Math.ceil(remaining / rate) : 0;
        const etaMin = Math.floor(eta / 60);
        const etaSec = eta % 60;
        process.stdout.write(
          `\r  Progress: ${stats.embedded}/${stats.total} (${stats.percentage}%) | +${totalGenerated} | ${Math.round(rate)}/s | ETA ${etaMin}m${etaSec.toString().padStart(2, "0")}s   `
        );
        if (stats.percentage >= 100) break;
      }
      const finalStats = sdk.getEmbeddingStats();
      const totalTime = Math.floor((Date.now() - startTime) / 1e3);
      console.log(`

  \u2713 Backfill complete: ${totalGenerated} embeddings generated in ${Math.floor(totalTime / 60)}m${(totalTime % 60).toString().padStart(2, "0")}s`);
      console.log(`  Coverage: ${finalStats.embedded}/${finalStats.total} (${finalStats.percentage}%)
`);
      break;
    }
    default:
      console.log("\nUsage: totalrecall embeddings <subcommand>\n");
      console.log("Subcommands:");
      console.log("  stats              Show embedding statistics");
      console.log("  backfill [size]    Generate embeddings (default: 50)");
      console.log("  backfill --all     Generate ALL missing embeddings with progress\n");
  }
}
async function semanticSearchCli(sdk, query) {
  if (!query) {
    console.error("Error: Please provide a search query");
    process.exit(1);
  }
  console.log(`
Semantic search: "${query}"...
`);
  await sdk.initializeEmbeddings();
  const results = await sdk.hybridSearch(query, { limit: 10 });
  if (results.length === 0) {
    console.log("No results found.\n");
    return;
  }
  console.log(`Found ${results.length} results:
`);
  results.forEach((r, i) => {
    const scorePercent = Math.round(r.score * 100);
    console.log(`  ${i + 1}. [${r.source}] ${r.title} (score: ${scorePercent}%)`);
    if (r.content) {
      console.log(`     ${r.content.substring(0, 150)}${r.content.length > 150 ? "..." : ""}`);
    }
    console.log("");
  });
}
async function handleDecay(sdk, subcommand) {
  switch (subcommand) {
    case "stats": {
      const stats = await sdk.getDecayStats();
      console.log("\nDecay Statistics:\n");
      console.log(`  Total observations:    ${stats.total}`);
      console.log(`  Stale (file changed):  ${stats.stale}`);
      console.log(`  Never accessed:        ${stats.neverAccessed}`);
      console.log(`  Recently accessed:     ${stats.recentlyAccessed} (last 48h)`);
      if (stats.total > 0) {
        const freshPercent = Math.round((stats.total - stats.stale) / stats.total * 100);
        console.log(`  Freshness:             ${freshPercent}%`);
      }
      console.log("");
      break;
    }
    case "detect-stale": {
      console.log("\nDetecting stale observations...\n");
      const count = await sdk.detectStaleObservations();
      if (count > 0) {
        console.log(`  Found and marked ${count} stale observation(s).`);
        console.log(`  These observations reference files that have been modified since they were recorded.
`);
      } else {
        console.log("  No stale observations found. All observations are fresh.\n");
      }
      break;
    }
    case "consolidate": {
      const dryRun = args.includes("--dry-run");
      console.log(`
${dryRun ? "[DRY RUN] " : ""}Consolidating duplicate observations...
`);
      const result = await sdk.consolidateObservations({ dryRun });
      if (result.merged > 0) {
        console.log(`  Merged ${result.merged} group(s), removed ${result.removed} duplicate(s).`);
        if (dryRun) {
          console.log(`  (Dry run: no changes were made. Remove --dry-run to apply.)`);
        }
      } else {
        console.log("  No duplicate observations found to consolidate.");
      }
      console.log("");
      break;
    }
    default:
      console.log("\nUsage: totalrecall decay <subcommand>\n");
      console.log("Subcommands:");
      console.log("  stats                Show decay statistics (stale, never accessed, etc.)");
      console.log("  detect-stale         Detect and mark stale observations (files changed)");
      console.log("  consolidate [--dry-run]  Consolidate duplicate observations\n");
  }
}
async function generateReportCli(sdk, cliArgs) {
  const periodArg = cliArgs.find((a) => a.startsWith("--period="))?.split("=")[1];
  const formatArg = cliArgs.find((a) => a.startsWith("--format="))?.split("=")[1];
  const outputArg = cliArgs.find((a) => a.startsWith("--output="))?.split("=")[1];
  const period = periodArg === "monthly" ? "monthly" : "weekly";
  const format = formatArg === "md" || formatArg === "markdown" ? "markdown" : formatArg === "json" ? "json" : "text";
  const data = await sdk.generateReport({ period });
  let output;
  switch (format) {
    case "markdown":
      output = formatReportMarkdown(data);
      break;
    case "json":
      output = formatReportJson(data);
      break;
    default:
      output = formatReportText(data);
  }
  if (outputArg) {
    writeFileSync5(outputArg, output, "utf8");
    console.log(`
  Report saved to: ${outputArg}
`);
  } else {
    console.log(output);
  }
}
async function resumeSession(sdk, sessionId) {
  const checkpoint = sessionId ? await sdk.getCheckpoint(sessionId) : await sdk.getLatestProjectCheckpoint();
  if (!checkpoint) {
    console.log("\n  No checkpoint found.");
    if (sessionId) {
      console.log(`  Session ${sessionId} has no checkpoint.`);
    } else {
      console.log(`  No recent checkpoints for project "${sdk.getProject()}".`);
    }
    console.log("  Checkpoints are created automatically at the end of each session.\n");
    return;
  }
  console.log("");
  console.log(`  \x1B[36m\u2550\u2550\u2550 Session Checkpoint \u2550\u2550\u2550\x1B[0m`);
  console.log(`  \x1B[2mProject: ${checkpoint.project} | Session: ${checkpoint.session_id}\x1B[0m`);
  console.log(`  \x1B[2m${new Date(checkpoint.created_at).toLocaleString()}\x1B[0m`);
  console.log("");
  console.log(`  \x1B[1mTask:\x1B[0m ${checkpoint.task}`);
  if (checkpoint.progress) {
    console.log(`  \x1B[1mProgress:\x1B[0m ${checkpoint.progress}`);
  }
  if (checkpoint.next_steps) {
    console.log(`  \x1B[1mNext Steps:\x1B[0m ${checkpoint.next_steps}`);
  }
  if (checkpoint.open_questions) {
    console.log(`  \x1B[1mOpen Questions:\x1B[0m ${checkpoint.open_questions}`);
  }
  if (checkpoint.relevant_files) {
    console.log(`  \x1B[1mRelevant Files:\x1B[0m`);
    const files = checkpoint.relevant_files.split(",").map((f) => f.trim());
    files.forEach((f) => {
      console.log(`    - ${f}`);
    });
  }
  console.log("");
}
async function searchInteractive(sdk, cliArgs) {
  const projectArg = cliArgs.find((a, i) => cliArgs[i - 1] === "--project") || cliArgs.find((a) => a.startsWith("--project="))?.split("=").slice(1).join("=");
  const isInteractive = cliArgs.includes("--interactive") || cliArgs.includes("-i");
  if (!isInteractive || !process.stdin.isTTY) {
    const queryArg = cliArgs.find((a) => !a.startsWith("-") && a !== "search");
    if (!queryArg) {
      console.error("Errore: fornisci un termine di ricerca o usa --interactive con un TTY");
      process.exit(1);
    }
    const results = projectArg ? await sdk.searchAdvanced(queryArg, { project: projectArg }) : await sdk.search(queryArg);
    const obs = results.observations.slice(0, 20);
    if (obs.length === 0) {
      console.log("\nNessun risultato trovato.\n");
      return;
    }
    console.log(`
Risultati per: "${queryArg}"
`);
    obs.forEach((o, i) => {
      const date = new Date(o.created_at).toLocaleDateString("it-IT");
      console.log(`  ${i + 1}. [${o.type}] ${o.title} \u2014 ${o.project} (${date})`);
    });
    console.log("");
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (question) => new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  const cyan = (s) => useColor ? `\x1B[36m${s}\x1B[0m` : s;
  const bold = (s) => useColor ? `\x1B[1m${s}\x1B[0m` : s;
  const dim = (s) => useColor ? `\x1B[2m${s}\x1B[0m` : s;
  console.log(`
${cyan("=== Total Recall \u2014 Ricerca Interattiva ===")}`);
  if (projectArg) console.log(dim(`  Filtro progetto: ${projectArg}`));
  console.log(dim('  Premi Ctrl+C o digita "exit" per uscire.\n'));
  while (true) {
    let query;
    try {
      query = await prompt(cyan("> "));
    } catch {
      break;
    }
    if (!query || query.toLowerCase() === "exit" || query.toLowerCase() === "quit") break;
    const results = projectArg ? await sdk.searchAdvanced(query, { project: projectArg }) : await sdk.search(query);
    const obs = results.observations.slice(0, 20);
    if (obs.length === 0) {
      console.log(dim("\n  Nessun risultato trovato.\n"));
      continue;
    }
    console.log(`
  ${bold(`${obs.length} risultato/i:`)}
`);
    obs.forEach((o, i) => {
      const date = new Date(o.created_at).toLocaleDateString("it-IT");
      console.log(`    ${bold(`${i + 1}.`)} [${o.type}] ${o.title}`);
      console.log(dim(`       ${o.project} \u2014 ${date}`));
    });
    console.log("");
    const selRaw = await prompt(`  Numero per dettagli (Invio per saltare): `);
    const selIdx = parseInt(selRaw) - 1;
    if (!isNaN(selIdx) && selIdx >= 0 && selIdx < obs.length) {
      const o = obs[selIdx];
      console.log("");
      console.log(`  ${bold("Titolo:")}     ${o.title}`);
      console.log(`  ${bold("Tipo:")}       ${o.type}`);
      console.log(`  ${bold("Progetto:")}   ${o.project}`);
      console.log(`  ${bold("Data:")}       ${new Date(o.created_at).toLocaleString("it-IT")}`);
      if (o.text) {
        console.log(`  ${bold("Contenuto:")}`);
        console.log(`    ${o.text.substring(0, 500)}${o.text.length > 500 ? "..." : ""}`);
      }
      if (o.narrative) {
        console.log(`  ${bold("Narrativa:")}`);
        console.log(`    ${o.narrative.substring(0, 300)}${o.narrative.length > 300 ? "..." : ""}`);
      }
      console.log("");
    }
  }
  rl.close();
  console.log("\n  Uscita dalla modalit\xE0 interattiva.\n");
}
async function exportObservations(sdk, cliArgs) {
  const formatArg = cliArgs.find((a) => a.startsWith("--format="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--format");
  const projectArg = cliArgs.find((a) => a.startsWith("--project="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--project");
  const outputArg = cliArgs.find((a) => a.startsWith("-o="))?.split("=").slice(1).join("=") || cliArgs.find((a) => a.startsWith("--output="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => (cliArgs[i - 1] === "--output" || cliArgs[i - 1] === "-o") && !a.startsWith("-"));
  const fromArg = cliArgs.find((a) => a.startsWith("--from="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--from" && !a.startsWith("-"));
  const toArg = cliArgs.find((a) => a.startsWith("--to="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--to" && !a.startsWith("-"));
  const typeArg = cliArgs.find((a) => a.startsWith("--type="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--type" && !a.startsWith("-"));
  const validFormats = ["jsonl", "json", "md"];
  const format = validFormats.includes(formatArg) ? formatArg : "jsonl";
  if (format === "json" || format === "md") {
    if (!projectArg) {
      console.error("Errore: --project <nome> \xE8 obbligatorio per il formato json/md");
      process.exit(1);
    }
    const kmDb2 = new TotalRecallDatabase();
    let observations;
    try {
      observations = getObservationsByProject(kmDb2.db, projectArg, 1e4);
    } finally {
      kmDb2.close();
    }
    if (observations.length === 0) {
      console.error(`Nessuna observation trovata per il progetto "${projectArg}"`);
      process.exit(1);
    }
    const output = generateExportOutput(observations, format);
    if (outputArg) {
      writeFileSync5(outputArg, output, "utf8");
      console.error(`
  Esportate ${observations.length} observations in: ${outputArg}
`);
    } else {
      process.stdout.write(output + "\n");
    }
    return;
  }
  const { generateMetaRecord: generateMetaRecord2, exportObservationsStreaming: exportObservationsStreaming2, exportSummariesStreaming: exportSummariesStreaming2, exportPromptsStreaming: exportPromptsStreaming2 } = await Promise.resolve().then(() => (init_ImportExport(), ImportExport_exports));
  const filters = {};
  if (projectArg) filters.project = projectArg;
  if (typeArg) filters.type = typeArg;
  if (fromArg) filters.from = fromArg;
  if (toArg) filters.to = toArg;
  const kmDb = new TotalRecallDatabase();
  try {
    if (outputArg) {
      const { createWriteStream } = await import("fs");
      const stream = createWriteStream(outputArg, { encoding: "utf8" });
      let obsCount = 0;
      let sumCount = 0;
      let promptCount = 0;
      stream.write(generateMetaRecord2(kmDb.db, filters) + "\n");
      obsCount = exportObservationsStreaming2(kmDb.db, filters, (line) => {
        stream.write(line + "\n");
      });
      sumCount = exportSummariesStreaming2(kmDb.db, filters, (line) => {
        stream.write(line + "\n");
      });
      promptCount = exportPromptsStreaming2(kmDb.db, filters, (line) => {
        stream.write(line + "\n");
      });
      await new Promise((resolve, reject) => {
        stream.end((err) => err ? reject(err) : resolve());
      });
      console.error(`
  Export JSONL completato:`);
      console.error(`    Observations: ${obsCount}`);
      console.error(`    Summaries:    ${sumCount}`);
      console.error(`    Prompts:      ${promptCount}`);
      console.error(`    File:         ${outputArg}
`);
    } else {
      process.stdout.write(generateMetaRecord2(kmDb.db, filters) + "\n");
      exportObservationsStreaming2(kmDb.db, filters, (line) => process.stdout.write(line + "\n"));
      exportSummariesStreaming2(kmDb.db, filters, (line) => process.stdout.write(line + "\n"));
      exportPromptsStreaming2(kmDb.db, filters, (line) => process.stdout.write(line + "\n"));
    }
  } finally {
    kmDb.close();
  }
}
async function importObservations(cliArgs) {
  const filePath = cliArgs.find((a) => !a.startsWith("-"));
  const dryRun = cliArgs.includes("--dry-run");
  const sourceIdx = cliArgs.indexOf("--source");
  const sourceName = sourceIdx >= 0 ? cliArgs[sourceIdx + 1] : void 0;
  const projectIdx = cliArgs.indexOf("--project");
  const projectName = projectIdx >= 0 ? cliArgs[projectIdx + 1] : void 0;
  const isTTY = process.stdout.isTTY ?? false;
  const green = (s) => isTTY ? `\x1B[32m${s}\x1B[0m` : s;
  const yellow = (s) => isTTY ? `\x1B[33m${s}\x1B[0m` : s;
  const red = (s) => isTTY ? `\x1B[31m${s}\x1B[0m` : s;
  const bold = (s) => isTTY ? `\x1B[1m${s}\x1B[0m` : s;
  const dim = (s) => isTTY ? `\x1B[2m${s}\x1B[0m` : s;
  if (!filePath) {
    console.error(
      "Errore: specifica il percorso del file JSONL\n  totalrecall import <file.jsonl> [--dry-run] [--source <adapter>] [--project <name>]\n  Adapters disponibili: claude-mem"
    );
    process.exit(1);
  }
  if (!existsSync8(filePath)) {
    console.error(`Errore: file non trovato: ${filePath}`);
    process.exit(1);
  }
  let content;
  try {
    content = readFileSync6(filePath, "utf8");
  } catch (err) {
    console.error(`Errore lettura file: ${err.message}`);
    process.exit(1);
  }
  const { getAdapter: getAdapter2, detectAdapter: detectAdapter2, listAdapters: listAdapters2 } = await Promise.resolve().then(() => (init_adapters(), adapters_exports));
  const { importJsonl: importJsonl2 } = await Promise.resolve().then(() => (init_ImportExport(), ImportExport_exports));
  let adapter = sourceName ? getAdapter2(sourceName) : void 0;
  if (sourceName && !adapter) {
    const available = listAdapters2();
    console.error(
      `Errore: adapter "${sourceName}" non trovato.
  Adapters disponibili: ${available.join(", ")}`
    );
    process.exit(1);
  }
  if (!adapter) {
    adapter = detectAdapter2(content);
    if (adapter) {
      console.log(`
  ${green("\u2713")} Detected format: ${bold(adapter.name)}`);
    } else if (!looksLikeNativeJsonl(content)) {
      const available = listAdapters2();
      console.error(
        `
  ${red("\u2717")} Could not auto-detect the file format.

  The file does not match any known import format.
  Available adapters:
` + available.map((name) => `    \u2022 ${name}`).join("\n") + `

  To specify the format manually:
    totalrecall import ${filePath} --source <adapter>

  If this is a native Total Recall JSONL file, ensure it contains
  records with a "_type" field (observation, summary, or prompt).`
      );
      process.exit(1);
    }
  }
  if (dryRun) {
    console.log(`
  ${dim("[DRY RUN]")} Analisi di "${filePath}"...`);
  } else {
    console.log(`
  Importazione di "${filePath}"...`);
  }
  const kmDb = new TotalRecallDatabase();
  let result;
  try {
    if (adapter) {
      console.log(`  Adapter: ${adapter.name}
`);
      const adapted = adapter.adapt(content, { defaultProject: projectName });
      if (dryRun) {
        printDryRunReport(adapted, {
          filePath,
          adapterName: adapter.name,
          green,
          yellow,
          red,
          bold,
          dim
        });
      }
      if (!dryRun && adapted.skipped.length > 0) {
        console.log(`  Record saltati dall'adapter: ${adapted.skipped.length}`);
        for (const skip of adapted.skipped.slice(0, 10)) {
          console.log(`    Riga ${skip.line}: ${skip.reason}`);
        }
        if (adapted.skipped.length > 10) {
          console.log(`    ... e altri ${adapted.skipped.length - 10}`);
        }
        console.log("");
      }
      const jsonlLines = [];
      for (const obs of adapted.observations) {
        jsonlLines.push(JSON.stringify(obs));
      }
      for (const sum of adapted.summaries) {
        jsonlLines.push(JSON.stringify(sum));
      }
      for (const pmt of adapted.prompts) {
        jsonlLines.push(JSON.stringify(pmt));
      }
      const jsonlContent = jsonlLines.join("\n");
      result = importJsonl2(kmDb.db, jsonlContent, dryRun);
      result._adapterCounts = {
        observations: adapted.observations.length,
        summaries: adapted.summaries.length,
        prompts: adapted.prompts.length,
        rejected: adapted.skipped.length
      };
      result.total += adapted.skipped.length;
      result.errors += adapted.skipped.length;
      for (const skip of adapted.skipped) {
        result.errorDetails.push({ line: skip.line, error: skip.reason });
      }
    } else {
      console.log("");
      result = importJsonl2(kmDb.db, content, dryRun);
    }
  } finally {
    kmDb.close();
  }
  if (dryRun) {
    if (!adapter) {
      const { formatImportResult: formatImportResult2 } = await Promise.resolve().then(() => (init_cli_utils(), cli_utils_exports));
      console.log(formatImportResult2({
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        total: result.total,
        dryRun,
        errorDetails: result.errorDetails
      }));
    } else {
      console.log(`
  ${dim("(Dry run: nessun dato inserito. Rimuovi --dry-run per applicare.)")}
`);
    }
  } else {
    const counts = result._adapterCounts;
    if (counts) {
      const imported = counts.observations + counts.summaries + counts.prompts;
      const lines = [
        "",
        `  ${bold("Import complete.")}`,
        `  Imported: ${green(String(counts.observations))} observations, ${green(String(counts.summaries))} summaries, ${green(String(counts.prompts))} prompts`,
        `  Skipped:  ${result.skipped > 0 ? yellow(String(result.skipped)) : String(result.skipped)} duplicates`,
        `  Rejected: ${counts.rejected > 0 ? red(String(counts.rejected)) : String(counts.rejected)} unsupported`,
        ""
      ];
      console.log(lines.join("\n"));
    } else {
      console.log([
        "",
        `  ${bold("Import complete.")}`,
        `  Imported: ${green(String(result.imported))} records`,
        `  Skipped:  ${result.skipped > 0 ? yellow(String(result.skipped)) : String(result.skipped)} duplicates`,
        `  Errors:   ${result.errors > 0 ? red(String(result.errors)) : String(result.errors)}`,
        ""
      ].join("\n"));
    }
  }
  if (result.imported === 0 && result.errors > 0 && result.skipped === 0) {
    process.exit(1);
  }
}
function printDryRunReport(adapted, opts) {
  const { green, yellow, red, bold, dim } = opts;
  const totalRecords = adapted.observations.length + adapted.summaries.length + adapted.prompts.length + adapted.skipped.length;
  const importable = adapted.observations.length + adapted.summaries.length + adapted.prompts.length;
  const rejectionsByReason = /* @__PURE__ */ new Map();
  for (const skip of adapted.skipped) {
    const key = categorizeSkipReason(skip.reason);
    rejectionsByReason.set(key, (rejectionsByReason.get(key) ?? 0) + 1);
  }
  console.log(`  ${bold("\u2500\u2500\u2500 Dry Run Report \u2500\u2500\u2500")}`);
  console.log("");
  console.log(`  Source:   ${opts.filePath}`);
  console.log(`  Adapter:  ${opts.adapterName}`);
  console.log("");
  console.log(`  ${bold("Records found:")}        ${totalRecords}`);
  console.log("");
  console.log(`  ${bold("By type:")}`);
  console.log(`    Observations:       ${green(String(adapted.observations.length))}`);
  console.log(`    Summaries:          ${green(String(adapted.summaries.length))}`);
  console.log(`    Prompts:            ${green(String(adapted.prompts.length))}`);
  console.log("");
  console.log(`  ${bold("Would be imported:")}    ${green(String(importable))}`);
  console.log(`  ${bold("Would be rejected:")}    ${adapted.skipped.length > 0 ? red(String(adapted.skipped.length)) : String(adapted.skipped.length)}`);
  console.log("");
  if (rejectionsByReason.size > 0) {
    console.log(`  ${bold("Rejection reasons:")}`);
    for (const [reason, count] of rejectionsByReason.entries()) {
      console.log(`    ${yellow(String(count).padStart(4))}  ${reason}`);
    }
    console.log("");
    const examples = adapted.skipped.slice(0, 5);
    if (examples.length > 0) {
      console.log(`  ${dim("Examples of rejected records:")}`);
      for (const skip of examples) {
        const idPart = skip.originalId ? ` (${skip.originalId})` : "";
        const typePart = skip.type ? ` [type=${skip.type}]` : "";
        console.log(`    Line ${skip.line}${idPart}${typePart}: ${skip.reason}`);
      }
      if (adapted.skipped.length > 5) {
        console.log(`    ${dim(`... and ${adapted.skipped.length - 5} more`)}`);
      }
      console.log("");
    }
  }
  const projects = /* @__PURE__ */ new Map();
  for (const obs of adapted.observations) {
    projects.set(obs.project, (projects.get(obs.project) ?? 0) + 1);
  }
  for (const sum of adapted.summaries) {
    projects.set(sum.project, (projects.get(sum.project) ?? 0) + 1);
  }
  for (const pmt of adapted.prompts) {
    projects.set(pmt.project, (projects.get(pmt.project) ?? 0) + 1);
  }
  if (projects.size > 1) {
    console.log(`  ${bold("By project:")}`);
    for (const [proj, count] of [...projects.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(count).padStart(4)}  ${proj}`);
    }
    console.log("");
  }
}
function categorizeSkipReason(reason) {
  if (reason.startsWith("Unsupported type:")) return "Unsupported record type";
  if (reason.includes("Empty content")) return "Empty content field";
  if (reason.includes("Invalid JSON")) return "Invalid JSON line";
  if (reason.includes("not a JSON object")) return "Non-object JSON value";
  return reason;
}
function looksLikeNativeJsonl(content) {
  if (!content || content.trim().length === 0) return false;
  const lines = content.split("\n");
  let checked = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && ("_type" in parsed || "_meta" in parsed)) {
        return true;
      }
    } catch {
    }
    checked++;
    if (checked >= 5) break;
  }
  return false;
}
async function runDoctorFix() {
  console.log("\n=== Total Recall \u2014 Riparazione Database ===\n");
  const kmDb = new TotalRecallDatabase();
  const db = kmDb.db;
  const messages = [];
  try {
    process.stdout.write("  [1/5] Ricostruzione indice FTS5... ");
    const ftsOk = rebuildFtsIndex(db);
    if (ftsOk) {
      console.log("\x1B[32m\u2713\x1B[0m");
      messages.push("Indice FTS5 ricostruito");
    } else {
      console.log("\x1B[33m~\x1B[0m (FTS non disponibile o gia' integro)");
    }
    process.stdout.write("  [2/5] Rimozione embeddings orfani... ");
    const removed = removeOrphanedEmbeddings(db);
    console.log(`\x1B[32m\u2713\x1B[0m (${removed} rimossi)`);
    if (removed > 0) messages.push(`${removed} embedding/s orfani rimossi`);
    process.stdout.write("  [3/5] Remove corrupted TEXT embeddings...");
    try {
      const textCount = db.query(
        "SELECT COUNT(*) as c FROM observation_embeddings WHERE typeof(embedding) = 'text'"
      ).get()?.c || 0;
      if (textCount > 0) {
        db.query(
          "DELETE FROM observation_embeddings WHERE typeof(embedding) = 'text'"
        ).run();
        console.log(` \x1B[32m\u2713\x1B[0m (${textCount} rimossi \u2014 run 'totalrecall embeddings backfill' to regenerate)`);
        messages.push(`${textCount} embedding corrotti (TEXT) rimossi \u2014 rigenerare con backfill`);
      } else {
        console.log(" \x1B[33m~\x1B[0m (nessun TEXT corrotto)");
      }
    } catch (err) {
      console.log(` \x1B[31m\u2717\x1B[0m (${err})`);
    }
    process.stdout.write("  [4/5] Cleanup zero-length embeddings...");
    try {
      const zeroResult = db.query(
        "DELETE FROM observation_embeddings WHERE length(embedding) = 0"
      ).run();
      const zeroCount = zeroResult.changes;
      if (zeroCount > 0) {
        console.log(` \x1B[32m\u2713\x1B[0m (${zeroCount} rimossi)`);
        messages.push(`${zeroCount} embedding zero-length rimossi`);
      } else {
        console.log(" \x1B[33m~\x1B[0m (nessuno)");
      }
    } catch (err) {
      console.log(` \x1B[31m\u2717\x1B[0m (${err})`);
    }
    process.stdout.write("  [5/5] VACUUM database...             ");
    const vacuumOk = vacuumDatabase(db);
    if (vacuumOk) {
      console.log("\x1B[32m\u2713\x1B[0m");
      messages.push("VACUUM completato");
    } else {
      console.log("\x1B[31m\u2717\x1B[0m");
    }
  } finally {
    kmDb.close();
  }
  if (messages.length > 0) {
    console.log("\n  Operazioni completate:");
    for (const msg of messages) {
      console.log(`    \x1B[32m\u2713\x1B[0m ${msg}`);
    }
  }
  console.log("");
}
async function showStats() {
  const kmDb = new TotalRecallDatabase();
  const db = kmDb.db;
  try {
    const obsRow = db.query(
      "SELECT COUNT(*) as total FROM observations"
    ).get();
    const sessRow = db.query(
      "SELECT COUNT(*) as total FROM sessions"
    ).get();
    const projRow = db.query(
      "SELECT COUNT(DISTINCT project) as cnt FROM observations"
    ).get();
    const topProject = db.query(
      `SELECT project, COUNT(*) as cnt
       FROM observations
       GROUP BY project
       ORDER BY cnt DESC
       LIMIT 1`
    ).get();
    let embCoverage = 0;
    try {
      const embStats = db.query(
        `SELECT
           (SELECT COUNT(*) FROM observations) as total,
           COUNT(DISTINCT observation_id) as embedded
         FROM observation_embeddings`
      ).get();
      if (embStats && embStats.total > 0) {
        embCoverage = Math.round(embStats.embedded / embStats.total * 100);
      }
    } catch {
    }
    const dbSize = getDbFileSize(DB_PATH);
    const stats = {
      totalObservations: obsRow?.total || 0,
      totalSessions: sessRow?.total || 0,
      totalProjects: projRow?.cnt || 0,
      dbSizeBytes: dbSize,
      mostActiveProject: topProject?.project || null,
      embeddingCoverage: embCoverage
    };
    console.log(formatStatsOutput(stats));
  } finally {
    kmDb.close();
  }
}
async function handleConfig(subArgs) {
  const subcommand = subArgs[0];
  const configPath = getConfigPath();
  switch (subcommand) {
    case "list": {
      const config = listConfig(configPath);
      console.log("\n=== Configurazione Total Recall ===\n");
      console.log(`  File: ${configPath}
`);
      for (const [key, value] of Object.entries(config)) {
        const displayValue = value === null ? "(non impostato)" : String(value);
        console.log(`  ${key.padEnd(35)} ${displayValue}`);
      }
      console.log("");
      break;
    }
    case "get": {
      const key = subArgs[1];
      if (!key) {
        console.error("Errore: specifica una chiave\n  totalrecall config get <chiave>");
        process.exit(1);
      }
      const val = getConfigValue(key, configPath);
      if (val === null) {
        console.log(`
  "${key}" non impostato (nessun valore di default)
`);
      } else {
        console.log(`
  ${key} = ${val}
`);
      }
      break;
    }
    case "set": {
      const key = subArgs[1];
      const rawValue = subArgs[2];
      if (!key) {
        console.error("Errore: specifica chiave e valore\n  totalrecall config set <chiave> <valore>");
        process.exit(1);
      }
      if (rawValue === void 0) {
        console.error(`Errore: valore mancante per "${key}"
  totalrecall config set ${key} <valore>`);
        process.exit(1);
      }
      const saved = setConfigValue(key, rawValue, configPath);
      console.log(`
  Impostato: ${key} = ${saved}
`);
      break;
    }
    default:
      console.log("\nUtilizzo: totalrecall config <subcommand>\n");
      console.log("Subcommands:");
      console.log("  list                         Mostra tutte le impostazioni");
      console.log("  get <chiave>                 Legge un valore");
      console.log("  set <chiave> <valore>        Imposta un valore\n");
      console.log("Esempio:");
      console.log("  totalrecall config list");
      console.log("  totalrecall config get worker.port");
      console.log("  totalrecall config set log.level DEBUG\n");
  }
}
async function handleBackup(subArgs) {
  const subCommand = subArgs[0];
  if (!subCommand || subCommand === "help") {
    console.log(`
Uso: totalrecall backup <sottocomando>

Sottocomandi:
  create              Crea un backup manuale del database
  list                Elenca i backup disponibili con metadata
  restore <file>      Ripristina il database da un file backup
`);
    return;
  }
  if (subCommand === "create") {
    const maxKeep = Number(getConfigValue("backup.maxKeep")) || 7;
    const db = new TotalRecallDatabase(DB_PATH, true);
    try {
      const entry = createBackup(DB_PATH, BACKUPS_DIR, db.db);
      const deleted = rotateBackups(BACKUPS_DIR, maxKeep);
      console.log(`
=== Total Recall \u2014 Backup Creato ===
`);
      console.log(`  File:        ${entry.metadata.filename}`);
      console.log(`  Timestamp:   ${entry.metadata.timestamp}`);
      console.log(`  Schema v.:   ${entry.metadata.schemaVersion}`);
      console.log(`  Obs.:        ${entry.metadata.stats.observations}`);
      console.log(`  Sessioni:    ${entry.metadata.stats.sessions}`);
      console.log(`  Dimensione:  ${(entry.metadata.stats.dbSizeBytes / 1024).toFixed(1)} KB`);
      if (deleted > 0) {
        console.log(`  Rotazione:   ${deleted} backup rimossi (max ${maxKeep} mantenuti)`);
      }
      console.log(`
  Directory:  ${BACKUPS_DIR}
`);
    } finally {
      db.close();
    }
    return;
  }
  if (subCommand === "list") {
    const entries = listBackups(BACKUPS_DIR);
    if (entries.length === 0) {
      console.log("\n  Nessun backup trovato in: " + BACKUPS_DIR + "\n");
      return;
    }
    console.log(`
=== Total Recall \u2014 Backup Disponibili ===
`);
    console.log(`  Directory: ${BACKUPS_DIR}
`);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const size = (e.metadata.stats.dbSizeBytes / 1024).toFixed(1);
      const date = new Date(e.metadata.timestampEpoch).toLocaleString("it-IT");
      console.log(`  ${i + 1}. ${e.metadata.filename}`);
      console.log(`     Data:      ${date}`);
      console.log(`     Schema:    v${e.metadata.schemaVersion}`);
      console.log(`     Obs.:      ${e.metadata.stats.observations} | Sessioni: ${e.metadata.stats.sessions}`);
      console.log(`     Dimensione: ${size} KB`);
      console.log("");
    }
    return;
  }
  if (subCommand === "restore") {
    const file = subArgs[1];
    if (!file) {
      console.error("\n  Errore: specifica il nome del file backup da ripristinare.");
      console.error("  Esempio: totalrecall backup restore backup-2026-02-27-150000.db\n");
      process.exit(1);
    }
    const backupPattern = /^backup-\d{4}-\d{2}-\d{2}-\d{6}(-\d{3})?\.db$/;
    if (file.includes("/") || file.includes("..") || !backupPattern.test(file)) {
      console.error(`
  Errore: nome file non valido: ${file}`);
      console.error('  Il file deve essere nel formato "backup-YYYY-MM-DD-HHmmss[-mmm].db"\n');
      process.exit(1);
    }
    const entries = listBackups(BACKUPS_DIR);
    const found = entries.find((e) => e.metadata.filename === file);
    if (!found) {
      console.error(`
  Errore: backup non trovato: ${file}`);
      console.error(`  Usa "totalrecall backup list" per vedere i backup disponibili.
`);
      process.exit(1);
    }
    const date = new Date(found.metadata.timestampEpoch).toLocaleString("it-IT");
    console.log(`
  ATTENZIONE: questa operazione sovrascrive il database corrente!`);
    console.log(`  Backup da ripristinare: ${file}`);
    console.log(`  Data backup:            ${date}`);
    console.log(`  Obs. nel backup:        ${found.metadata.stats.observations}`);
    console.log("");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const confirmed = await new Promise((resolve) => {
      rl.question('  Confermi il ripristino? (digita "si" per confermare): ', (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "si");
      });
    });
    if (!confirmed) {
      console.log("\n  Ripristino annullato.\n");
      return;
    }
    restoreBackup(found.filePath, DB_PATH);
    console.log(`
  Database ripristinato da: ${file}`);
    console.log("  Riavvia il worker per applicare le modifiche.\n");
    return;
  }
  console.error(`
  Sottocomando backup non riconosciuto: ${subCommand}`);
  console.error("  Usa: create | list | restore\n");
  process.exit(1);
}
async function handleWorker(commandName) {
  const host = String(process.env.TOTALRECALL_WORKER_HOST || process.env.CONTEXTKIT_WORKER_HOST || "127.0.0.1");
  const port = String(process.env.TOTALRECALL_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || "3001");
  const pidFile = join7(DATA_DIR, "worker.pid");
  const workerPath = join7(DIST_DIR, "worker-service.js");
  const healthUrl = `http://${host}:${port}/health`;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function isHealthy() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const resp = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);
      return resp.ok;
    } catch {
      return false;
    }
  }
  function readPid() {
    try {
      if (!existsSync8(pidFile)) return null;
      const raw = readFileSync6(pidFile, "utf8").trim();
      const pid = Number(raw);
      return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }
  function processExists(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  async function stopWorker() {
    const pid = readPid();
    if (!pid) {
      if (existsSync8(pidFile)) {
        try {
          unlinkSync3(pidFile);
        } catch {
        }
      }
      return false;
    }
    if (!processExists(pid)) {
      try {
        unlinkSync3(pidFile);
      } catch {
      }
      return false;
    }
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return false;
    }
    for (let i = 0; i < 20; i++) {
      if (!processExists(pid)) {
        try {
          if (existsSync8(pidFile)) unlinkSync3(pidFile);
        } catch {
        }
        return true;
      }
      await sleep(250);
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {
    }
    for (let i = 0; i < 10; i++) {
      if (!processExists(pid)) {
        try {
          if (existsSync8(pidFile)) unlinkSync3(pidFile);
        } catch {
        }
        return true;
      }
      await sleep(100);
    }
    return false;
  }
  async function startWorker() {
    if (await isHealthy()) {
      console.log(`
  Worker already running on ${healthUrl}
`);
      return;
    }
    const stalePid = readPid();
    if (stalePid && !processExists(stalePid)) {
      try {
        unlinkSync3(pidFile);
      } catch {
      }
    }
    const child = __require("child_process").spawn(process.execPath, [workerPath], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env }
    });
    child.unref();
    for (let i = 0; i < 20; i++) {
      if (await isHealthy()) {
        console.log(`
  Worker started on ${healthUrl}
`);
        return;
      }
      await sleep(250);
    }
    console.error(`
  Worker did not become healthy on ${healthUrl}. Check logs with: npm run worker:logs
`);
    process.exit(1);
  }
  switch (commandName) {
    case "worker:start":
      await startWorker();
      return;
    case "worker:stop": {
      const stopped = await stopWorker();
      console.log(stopped ? "\n  Worker stopped.\n" : "\n  Worker is not running.\n");
      return;
    }
    case "worker:restart":
      await stopWorker();
      await startWorker();
      return;
    case "worker:status": {
      const healthy = await isHealthy();
      if (healthy) {
        const pid2 = readPid();
        console.log(`
  Worker is running on ${healthUrl}${pid2 ? ` (pid ${pid2})` : ""}.
`);
        return;
      }
      const pid = readPid();
      if (pid && !processExists(pid)) {
        try {
          unlinkSync3(pidFile);
        } catch {
        }
      }
      console.log(`
  Worker is not running on ${healthUrl}.
`);
      process.exit(1);
    }
  }
}
async function handlePlugins(subArgs) {
  const subCommand = subArgs[0];
  const port = process.env.TOTALRECALL_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || "3001";
  const baseUrl = `http://127.0.0.1:${port}`;
  async function apiGet(path) {
    return new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}${path}`, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            reject(new Error(`Risposta non JSON: ${body}`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(5e3, () => {
        req.destroy(new Error("Timeout"));
      });
    });
  }
  async function apiPost(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "127.0.0.1",
        port: parseInt(port, 10),
        path,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": 0 }
      };
      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            reject(new Error(`Risposta non JSON: ${body}`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(1e4, () => {
        req.destroy(new Error("Timeout"));
      });
      req.end();
    });
  }
  if (!subCommand || subCommand === "list") {
    try {
      const result = await apiGet("/api/plugins");
      const { plugins } = result.data;
      console.log("\n=== Total Recall \u2014 Plugin ===\n");
      if (!plugins || plugins.length === 0) {
        console.log("  Nessun plugin registrato.\n");
        return;
      }
      for (const p of plugins) {
        const stateColor = p.state === "active" ? "\x1B[32m" : p.state === "error" ? "\x1B[31m" : "\x1B[33m";
        console.log(`  ${p.name}@${p.version}`);
        console.log(`    Stato:    ${stateColor}${p.state}\x1B[0m`);
        if (p.description) console.log(`    Desc.:    ${p.description}`);
        if (p.error) console.log(`    Errore:   \x1B[31m${p.error}\x1B[0m`);
        console.log("");
      }
    } catch {
      console.error("\n  Errore: impossibile contattare il worker. Avvialo con: totalrecall worker start\n");
      process.exit(1);
    }
    return;
  }
  if (subCommand === "enable") {
    const name = subArgs[1];
    if (!name) {
      console.error("\n  Errore: specifica il nome del plugin.\n  Esempio: totalrecall plugins enable mio-plugin\n");
      process.exit(1);
    }
    try {
      const result = await apiPost(`/api/plugins/${encodeURIComponent(name)}/enable`);
      if (result.status === 200) {
        console.log(`
  Plugin "${name}" abilitato con successo.`);
        if (result.data.plugin?.state === "error") {
          console.log(`  Attenzione: stato corrente = error: ${result.data.plugin.error}`);
        }
        console.log("");
      } else {
        console.error(`
  Errore: ${result.data.error}
`);
        process.exit(1);
      }
    } catch {
      console.error("\n  Errore: impossibile contattare il worker.\n");
      process.exit(1);
    }
    return;
  }
  if (subCommand === "disable") {
    const name = subArgs[1];
    if (!name) {
      console.error("\n  Errore: specifica il nome del plugin.\n  Esempio: totalrecall plugins disable mio-plugin\n");
      process.exit(1);
    }
    try {
      const result = await apiPost(`/api/plugins/${encodeURIComponent(name)}/disable`);
      if (result.status === 200) {
        console.log(`
  Plugin "${name}" disabilitato.
`);
      } else {
        console.error(`
  Errore: ${result.data.error}
`);
        process.exit(1);
      }
    } catch {
      console.error("\n  Errore: impossibile contattare il worker.\n");
      process.exit(1);
    }
    return;
  }
  console.error(`
  Sottocomando plugins non riconosciuto: ${subCommand}`);
  console.error("  Usa: list | enable <nome> | disable <nome>\n");
  process.exit(1);
}
async function handleService(subArgs) {
  const { install: install2, uninstall: uninstall2, status: status2, detectStrategy: detectStrategy2 } = await Promise.resolve().then(() => (init_service_installer(), service_installer_exports));
  const sub = subArgs[0];
  if (!sub || sub === "status") {
    const s = status2();
    console.log("\n=== Total Recall \u2014 Service Status ===\n");
    console.log(`  Installed:  ${s.installed ? "yes" : "no"}`);
    console.log(`  Strategy:   ${s.strategy}`);
    console.log(`  Details:    ${s.details}`);
    if (!s.installed) {
      console.log(`
  Detected:   ${detectStrategy2()} available`);
      console.log("  Run: totalrecall service install");
    }
    console.log("");
    return;
  }
  if (sub === "install") {
    const result = install2();
    console.log(`
  ${result.success ? "\u2713" : "\u2717"} ${result.message}`);
    if (result.success) {
      console.log(`  Strategy: ${result.strategy}`);
    }
    console.log("");
    return;
  }
  if (sub === "uninstall") {
    const result = uninstall2();
    console.log(`
  ${result.success ? "\u2713" : "\u2717"} ${result.message}
`);
    return;
  }
  console.error(`
  Unknown service subcommand: ${sub}`);
  console.error("  Usage: totalrecall service install|uninstall|status\n");
  process.exit(1);
}
async function handleShare(subArgs) {
  const subCommand = subArgs[0];
  const port = process.env.TOTALRECALL_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || "3001";
  const host = process.env.TOTALRECALL_WORKER_HOST || process.env.CONTEXTKIT_WORKER_HOST || "127.0.0.1";
  const baseUrl = `http://${host}:${port}`;
  const tokenFile = join7(DATA_DIR, "worker.token");
  let workerToken;
  try {
    workerToken = readFileSync6(tokenFile, "utf-8").trim();
  } catch {
    console.error("\n  Error: Cannot read worker token. Is the worker running?");
    console.error("  Start with: totalrecall worker:start\n");
    process.exit(1);
  }
  async function apiGet(path) {
    return new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}${path}`, { headers: { "X-Worker-Token": workerToken } }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            reject(new Error(`Non-JSON response: ${body}`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(5e3, () => {
        req.destroy(new Error("Timeout"));
      });
    });
  }
  async function apiPost(path, bodyData) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(bodyData);
      const options = {
        hostname: host,
        port: parseInt(port, 10),
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "X-Worker-Token": workerToken
        }
      };
      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            reject(new Error(`Non-JSON response: ${body}`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(1e4, () => {
        req.destroy(new Error("Timeout"));
      });
      req.write(payload);
      req.end();
    });
  }
  async function apiDelete(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: host,
        port: parseInt(port, 10),
        path,
        method: "DELETE",
        headers: { "X-Worker-Token": workerToken }
      };
      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            reject(new Error(`Non-JSON response: ${body}`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(5e3, () => {
        req.destroy(new Error("Timeout"));
      });
      req.end();
    });
  }
  if (!subCommand || subCommand === "help") {
    console.log(`
Usage: totalrecall share <subcommand>

Subcommands:
  create [options]     Create a new read-only sharing token
  list                 List all sharing tokens
  revoke <id>          Revoke a sharing token

Options for 'create':
  --project <name>     Scope token to a specific project (default: all projects)
  --expires <duration> Token expiration (default: 7d). Format: 7d, 24h, 30m
  --label <text>       Optional label for the token
`);
    return;
  }
  if (subCommand === "create") {
    let project;
    let expires;
    let label;
    for (let i = 1; i < subArgs.length; i++) {
      const arg = subArgs[i];
      if (arg === "--project" && subArgs[i + 1]) {
        project = subArgs[++i];
      } else if (arg === "--expires" && subArgs[i + 1]) {
        expires = subArgs[++i];
      } else if (arg === "--label" && subArgs[i + 1]) {
        label = subArgs[++i];
      }
    }
    try {
      const result = await apiPost("/api/sharing/tokens", {
        project: project || null,
        expires: expires || "7d",
        label: label || null
      });
      if (result.status !== 201) {
        console.error(`
  Error: ${result.data.error || "Failed to create token"}
`);
        process.exit(1);
      }
      const { id, url, expires_at } = result.data;
      console.log(`
=== Total Recall \u2014 Share Token Created ===
`);
      console.log(`  ID:        ${id}`);
      console.log(`  Project:   ${project || "(all projects)"}`);
      console.log(`  Expires:   ${new Date(expires_at).toLocaleString()}`);
      if (label) console.log(`  Label:     ${label}`);
      console.log(`
  Share URL:`);
      console.log(`  ${url}
`);
    } catch {
      console.error("\n  Error: Cannot connect to worker. Start with: totalrecall worker:start\n");
      process.exit(1);
    }
    return;
  }
  if (subCommand === "list") {
    try {
      const result = await apiGet("/api/sharing/tokens");
      if (result.status !== 200) {
        console.error(`
  Error: ${result.data.error || "Failed to list tokens"}
`);
        process.exit(1);
      }
      const { tokens } = result.data;
      console.log("\n=== Total Recall \u2014 Sharing Tokens ===\n");
      if (!tokens || tokens.length === 0) {
        console.log("  No sharing tokens found.\n");
        console.log("  Create one with: totalrecall share create --project myapp\n");
        return;
      }
      for (const t of tokens) {
        const statusIcon = t.is_revoked ? "\u{1F6AB}" : t.is_expired ? "\u23F0" : "\u2705";
        const status2 = t.is_revoked ? "revoked" : t.is_expired ? "expired" : "active";
        console.log(`  ${statusIcon} ${t.id}`);
        console.log(`     Project:  ${t.project || "(all)"}`);
        console.log(`     Status:   ${status2}`);
        console.log(`     Expires:  ${new Date(t.expires_at).toLocaleString()}`);
        console.log(`     Created:  ${new Date(t.created_at).toLocaleString()}`);
        if (t.label) console.log(`     Label:    ${t.label}`);
        console.log("");
      }
    } catch {
      console.error("\n  Error: Cannot connect to worker. Start with: totalrecall worker:start\n");
      process.exit(1);
    }
    return;
  }
  if (subCommand === "revoke") {
    const tokenId = subArgs[1];
    if (!tokenId) {
      console.error("\n  Error: Token ID is required.");
      console.error("  Usage: totalrecall share revoke <id>\n");
      process.exit(1);
    }
    try {
      const result = await apiDelete(`/api/sharing/tokens/${encodeURIComponent(tokenId)}`);
      if (result.status === 404) {
        console.error(`
  Error: Token not found or already revoked.
`);
        process.exit(1);
      }
      if (result.status !== 200) {
        console.error(`
  Error: ${result.data.error || "Failed to revoke token"}
`);
        process.exit(1);
      }
      console.log(`
  \u2705 Token ${tokenId} revoked successfully.
`);
    } catch {
      console.error("\n  Error: Cannot connect to worker. Start with: totalrecall worker:start\n");
      process.exit(1);
    }
    return;
  }
  console.error(`
  Unknown share subcommand: ${subCommand}`);
  console.error("  Usage: totalrecall share create|list|revoke\n");
  process.exit(1);
}
function showHelp() {
  console.log(`Usage: totalrecall <command> [options]

Setup:
  install                   Install for Kiro CLI (default)
  install --claude-code     Install hooks and MCP server for Claude Code
  install --cursor          Install hooks and MCP server for Cursor IDE
  install --windsurf        Install MCP server for Windsurf IDE
  install --cline           Install MCP server for Cline (VS Code)
  doctor                    Run environment diagnostics (checks Node, build tools, WSL, etc.)
  doctor --fix              Auto-repair: rebuild FTS5, remove orphaned embeddings, VACUUM

Commands:
  context, ctx              Show current project context
  resume [session-id]       Resume previous session (shows checkpoint)
  report [options]          Generate activity report
    --period=weekly|monthly   Time period (default: weekly)
    --format=text|md|json     Output format (default: text)
    --output=<file>           Write to file instead of stdout
  stats                     Quick database overview (totals, size, active project, embeddings)
  search <query>            Search across all context (keyword FTS5)
  search --interactive      Interactive REPL search with result selection
    --project <name>          Filter results by project
  semantic-search <query>   Hybrid search: vector + keyword (semantic)
  export --project <name>   Export observations to JSONL/JSON/Markdown
    --format=jsonl|json|md    Output format (default: jsonl)
    --output=<file>           Write to file instead of stdout
  import <file>             Import observations from JSONL file (deduplication by content_hash)
  config list               Show all configuration settings
  config get <key>          Show a single configuration value
  config set <key> <value>  Set a configuration value
  observations [limit]      Show recent observations (default: 10)
  summaries [limit]         Show recent summaries (default: 5)
  add-observation <title> <content>   Add a new observation
  add-summary <content>     Add a new summary
  add-knowledge <type> <title> <content>  Store structured knowledge
    Types: constraint, decision, heuristic, rejected
    Options: --severity=hard|soft  --alternatives=a,b,c  --reason=...
             --context=...  --confidence=high|medium|low
             --concepts=a,b  --files=path1,path2
  embeddings stats          Show embedding statistics
  embeddings backfill [n]   Generate embeddings for unprocessed observations
  decay stats               Show decay statistics (stale, never accessed, etc.)
  decay detect-stale        Detect and mark stale observations
  decay consolidate [--dry-run]  Consolidate duplicate observations
  backup create             Crea un backup manuale del database
  backup list               Elenca tutti i backup disponibili con metadata
  backup restore <file>     Ripristina il database da un backup (con conferma)
  worker:start              Start the background worker
  worker:stop               Stop the background worker
  worker:restart            Restart the background worker
  worker:status             Check worker health and PID
  service install           Auto-start worker on boot (crontab or systemd)
  service uninstall         Remove auto-start configuration
  service status            Show auto-start status
  plugins list              Elenca tutti i plugin registrati con stato
  plugins enable <nome>     Abilita un plugin registrato
  plugins disable <nome>    Disabilita un plugin attivo
  share create [options]    Create a read-only sharing token
  share list                List all sharing tokens
  share revoke <id>         Revoke a sharing token
  help                      Show this help message

Examples:
  totalrecall install
  totalrecall doctor
  totalrecall doctor --fix
  totalrecall stats
  totalrecall context
  totalrecall resume
  totalrecall resume 42
  totalrecall report
  totalrecall report --period=monthly --format=md --output=report.md
  totalrecall search "authentication"
  totalrecall search --interactive --project myapp
  totalrecall semantic-search "how did I fix the auth bug"
  totalrecall export --project myapp --format jsonl --output backup.jsonl
  totalrecall export --project myapp --format md > notes.md
  totalrecall import backup.jsonl
  totalrecall backup create
  totalrecall backup list
  totalrecall backup restore backup-2026-02-27-150000.db
  totalrecall worker:start
  totalrecall worker:status
  totalrecall worker:restart
  totalrecall config list
  totalrecall config get worker.port
  totalrecall config set log.level DEBUG
  totalrecall add-knowledge constraint "No any in TypeScript" "Never use any type" --severity=hard
  totalrecall add-knowledge decision "PostgreSQL over MongoDB" "Chosen for ACID" --alternatives=MongoDB,DynamoDB
  totalrecall embeddings stats
  totalrecall embeddings backfill 100
  totalrecall decay stats
  totalrecall decay detect-stale
  totalrecall decay consolidate --dry-run
  totalrecall observations 20
  totalrecall share create --project myapp --expires 7d
  totalrecall share list
  totalrecall share revoke <token-id>
`);
}
async function handleUsers(subArgs) {
  const subCommand = subArgs[0];
  const port = process.env.TOTALRECALL_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || "3001";
  const baseUrl = `http://127.0.0.1:${port}`;
  if (!subCommand || subCommand === "help") {
    console.log(`
Usage: totalrecall users <subcommand>

Subcommands:
  create <email> [options]  Create a new user
  list                      List all users
  role <email> <role>       Change user role (admin|editor|viewer)
  delete <email>            Deactivate a user

Options for 'create':
  --role <role>     Role: admin, editor, viewer (default: viewer)
  --name <name>     Display name (default: derived from email)
  --password <pwd>  Set password (default: auto-generated)

Examples:
  totalrecall users create admin@example.com --role admin
  totalrecall users list
  totalrecall users role user@example.com editor
  totalrecall users delete old@example.com
`);
    return;
  }
  if (subCommand === "create") {
    const email = subArgs[1];
    if (!email || !email.includes("@")) {
      console.error("\n  Error: valid email is required.\n  Usage: totalrecall users create <email> --role <role>\n");
      process.exit(1);
    }
    let role = "viewer";
    let displayName = "";
    let password = "";
    for (let i = 2; i < subArgs.length; i++) {
      const arg = subArgs[i];
      if (arg === "--role" && subArgs[i + 1]) {
        role = subArgs[++i];
      } else if (arg === "--name" && subArgs[i + 1]) {
        displayName = subArgs[++i];
      } else if (arg === "--password" && subArgs[i + 1]) {
        password = subArgs[++i];
      }
    }
    if (!["admin", "editor", "viewer"].includes(role)) {
      console.error(`
  Error: invalid role "${role}". Must be admin, editor, or viewer.
`);
      process.exit(1);
    }
    const db = new TotalRecallDatabase();
    try {
      const { getUserByEmail: getUserByEmail2, createUser: createUser2, countAdmins: countAdmins2 } = await Promise.resolve().then(() => (init_Users(), Users_exports));
      const normalizedEmail = email.toLowerCase().trim();
      const existing = getUserByEmail2(db.db, normalizedEmail);
      if (existing) {
        console.error(`
  Error: user "${normalizedEmail}" already exists.
`);
        process.exit(1);
      }
      const crypto2 = await import("crypto");
      let plainPassword = password || crypto2.randomBytes(16).toString("base64url");
      let passwordHash;
      try {
        const bcrypt = await Promise.resolve().then(() => __toESM(require_bcryptjs(), 1));
        passwordHash = bcrypt.hashSync(plainPassword, 10);
      } catch {
        passwordHash = crypto2.createHash("sha256").update(plainPassword).digest("hex");
      }
      const name = displayName || normalizedEmail.split("@")[0] || normalizedEmail;
      const user = createUser2(db.db, normalizedEmail, passwordHash, role, name);
      console.log("\n=== User Created ===\n");
      console.log(`  Email:     ${user.email}`);
      console.log(`  Role:      ${user.role}`);
      console.log(`  Name:      ${user.display_name}`);
      if (!password) {
        console.log(`  Password:  ${plainPassword}`);
        console.log("");
        console.log("  \u26A0\uFE0F  Save this password \u2014 it will not be shown again.");
      }
      console.log("");
    } finally {
      db.close();
    }
    return;
  }
  if (subCommand === "list") {
    const db = new TotalRecallDatabase();
    try {
      const { listUsers: listUsers2 } = await Promise.resolve().then(() => (init_Users(), Users_exports));
      const users = listUsers2(db.db);
      if (users.length === 0) {
        console.log("\n  No users found. Create one with: totalrecall users create <email> --role admin\n");
        return;
      }
      console.log("\n=== Total Recall \u2014 Users ===\n");
      console.log("  " + "Email".padEnd(30) + "Role".padEnd(10) + "Name".padEnd(20) + "Active  Last Login");
      console.log("  " + "-".repeat(90));
      for (const user of users) {
        const active = user.is_active ? "\u2713" : "\u2717";
        const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString() : "never";
        console.log(
          "  " + user.email.padEnd(30) + user.role.padEnd(10) + (user.display_name || "").padEnd(20) + active.padEnd(8) + lastLogin
        );
      }
      console.log("");
    } finally {
      db.close();
    }
    return;
  }
  if (subCommand === "role") {
    const email = subArgs[1];
    const newRole = subArgs[2];
    if (!email || !newRole) {
      console.error("\n  Usage: totalrecall users role <email> <admin|editor|viewer>\n");
      process.exit(1);
    }
    if (!["admin", "editor", "viewer"].includes(newRole)) {
      console.error(`
  Error: invalid role "${newRole}". Must be admin, editor, or viewer.
`);
      process.exit(1);
    }
    const db = new TotalRecallDatabase();
    try {
      const { getUserByEmail: getUserByEmail2, updateUserRole: updateUserRole2, countAdmins: countAdmins2 } = await Promise.resolve().then(() => (init_Users(), Users_exports));
      const user = getUserByEmail2(db.db, email.toLowerCase().trim());
      if (!user) {
        console.error(`
  Error: user "${email}" not found.
`);
        process.exit(1);
      }
      if (user.role === "admin" && newRole !== "admin") {
        const adminCount = countAdmins2(db.db);
        if (adminCount <= 1) {
          console.error("\n  Error: cannot remove the last admin.\n");
          process.exit(1);
        }
      }
      updateUserRole2(db.db, user.id, newRole);
      console.log(`
  Updated: ${user.email} role changed from "${user.role}" to "${newRole}"
`);
    } finally {
      db.close();
    }
    return;
  }
  if (subCommand === "delete") {
    const email = subArgs[1];
    if (!email) {
      console.error("\n  Usage: totalrecall users delete <email>\n");
      process.exit(1);
    }
    const db = new TotalRecallDatabase();
    try {
      const { getUserByEmail: getUserByEmail2, deactivateUser: deactivateUser2, countAdmins: countAdmins2 } = await Promise.resolve().then(() => (init_Users(), Users_exports));
      const user = getUserByEmail2(db.db, email.toLowerCase().trim());
      if (!user) {
        console.error(`
  Error: user "${email}" not found.
`);
        process.exit(1);
      }
      if (user.role === "admin") {
        const adminCount = countAdmins2(db.db);
        if (adminCount <= 1) {
          console.error("\n  Error: cannot deactivate the last admin.\n");
          process.exit(1);
        }
      }
      deactivateUser2(db.db, user.id);
      console.log(`
  Deactivated: ${user.email}
`);
    } finally {
      db.close();
    }
    return;
  }
  console.error(`
  Unknown subcommand: ${subCommand}`);
  console.error("  Use: totalrecall users help\n");
  process.exit(1);
}
async function handleTeam(subArgs) {
  const subCommand = subArgs[0];
  if (!subCommand || subCommand === "help") {
    console.log(`
  totalrecall team \u2014 Sync shared knowledge with your team via Git

  Commands:
    init <repo-url>    Initialize team sync (clone repo, save config)
    push               Export knowledge \u2192 commit \u2192 push to remote
    pull               Pull from remote \u2192 import new knowledge (local wins)
    status             Show sync configuration and state

  Options (init):
    --interval <min>   Auto-sync interval in minutes (default: 60)

  Examples:
    totalrecall team init git@github.com:my-org/shared-knowledge.git
    totalrecall team push
    totalrecall team pull
    totalrecall team status
`);
    return;
  }
  if (subCommand === "init") {
    const repoUrl = subArgs[1];
    if (!repoUrl) {
      console.error("  Error: Please provide a repository URL.\n  Example: totalrecall team init git@github.com:org/repo.git\n");
      process.exit(1);
    }
    const intervalIdx = subArgs.indexOf("--interval");
    const syncInterval = intervalIdx >= 0 ? parseInt(subArgs[intervalIdx + 1] ?? "60", 10) : 60;
    try {
      const config = initTeamConfig(repoUrl, { syncInterval });
      console.log(`
  \u2705 Team sync initialized.`);
      console.log(`     Repo: ${config.repoUrl}`);
      console.log(`     Local: ${config.localPath}`);
      console.log(`     Sync interval: ${config.syncInterval} min
`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  \u274C Failed to initialize team sync: ${msg}
`);
      process.exit(1);
    }
    return;
  }
  if (subCommand === "push") {
    const config = loadTeamConfig();
    if (!config) {
      console.error("  \u274C Team sync not initialized. Run: totalrecall team init <repo-url>\n");
      process.exit(1);
    }
    const db = new TotalRecallDatabase();
    try {
      console.log("  Exporting knowledge and pushing...");
      const result = pushKnowledge(db.db, config);
      console.log(`
  \u2705 Push complete.`);
      console.log(`     Exported: ${result.exported} items`);
      if (result.errors.length > 0) {
        console.log(`     \u26A0\uFE0F  Errors:`);
        for (const err of result.errors) {
          console.log(`        - ${err}`);
        }
      }
      console.log("");
    } finally {
      db.close();
    }
    return;
  }
  if (subCommand === "pull") {
    const config = loadTeamConfig();
    if (!config) {
      console.error("  \u274C Team sync not initialized. Run: totalrecall team init <repo-url>\n");
      process.exit(1);
    }
    const db = new TotalRecallDatabase();
    try {
      console.log("  Pulling from remote and importing...");
      const result = pullKnowledge(db.db, config);
      console.log(`
  \u2705 Pull complete.`);
      console.log(`     Imported: ${result.imported} items`);
      if (result.conflicts.length > 0) {
        console.log(`     \u2139\uFE0F  Conflicts (local wins):`);
        for (const conflict of result.conflicts) {
          console.log(`        - ${conflict}`);
        }
      }
      if (result.errors.length > 0) {
        console.log(`     \u26A0\uFE0F  Errors:`);
        for (const err of result.errors) {
          console.log(`        - ${err}`);
        }
      }
      console.log("");
    } finally {
      db.close();
    }
    return;
  }
  if (subCommand === "status") {
    const config = loadTeamConfig();
    if (!config) {
      console.log("\n  Team sync: not configured");
      console.log("  Run: totalrecall team init <repo-url>\n");
      return;
    }
    const status2 = getTeamStatus(config);
    console.log(`
  \u{1F4E1} Team Sync Status`);
    console.log(`     Repo:       ${status2.repoUrl}`);
    console.log(`     Local path: ${status2.localPath}`);
    console.log(`     Last sync:  ${status2.lastSync || "never"}`);
    console.log(`     Interval:   ${status2.syncInterval} min`);
    console.log(`     Shared items: ${status2.localKnowledgeCount} files
`);
    return;
  }
  console.error(`  Unknown team subcommand: ${subCommand}`);
  console.error("  Use: init | push | pull | status\n");
  process.exit(1);
}
main().catch(console.error);
/*! Bundled license information:

bcryptjs/dist/bcrypt.js:
  (**
   * @license bcrypt.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
   * Released under the Apache License, Version 2.0
   * see: https://github.com/dcodeIO/bcrypt.js for details
   *)
*/
