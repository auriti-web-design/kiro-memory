/**
 * Structured Logger for Total Recall Worker Service
 * Provides readable, traceable logging with correlation IDs and data flow tracking
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { LOGS_DIR, USER_SETTINGS_PATH } from '../shared/paths.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export type Component = 'HOOK' | 'WORKER' | 'SDK' | 'PARSER' | 'DB' | 'SYSTEM' | 'HTTP' | 'SESSION' | 'CHROMA' | 'CHROMA_SYNC' | 'FOLDER_INDEX' | 'CONTEXT' | 'QUEUE' | 'EMBEDDING' | 'SEARCH' | 'VECTOR' | 'WEBHOOK' | 'BACKUP' | 'AUTH' | 'SHARING' | 'JWT';

interface LogContext {
  sessionId?: number;
  memorySessionId?: string;
  correlationId?: string;
  [key: string]: any;
}


class Logger {
  private level: LogLevel | null = null;
  private useColor: boolean;
  private logFilePath: string | null = null;
  private logFileInitialized: boolean = false;

  constructor() {
    // Disable colors when output is not a TTY (e.g., PM2 logs)
    this.useColor = process.stdout.isTTY ?? false;
  }

  /**
   * Initialize log file path and ensure directory exists (lazy initialization)
   */
  private ensureLogFileInitialized(): void {
    if (this.logFileInitialized) return;
    this.logFileInitialized = true;

    try {
      // Ensure logs directory exists
      if (!existsSync(LOGS_DIR)) {
        mkdirSync(LOGS_DIR, { recursive: true });
      }

      // Create log file path with date
      const date = new Date().toISOString().split('T')[0];
      this.logFilePath = join(LOGS_DIR, `totalrecall-${date}.log`);
    } catch (error) {
      console.error('[LOGGER] Failed to initialize log file:', error);
      this.logFilePath = null;
    }
  }

  /**
   * Lazy-load log level from settings file
   */
  private getLevel(): LogLevel {
    if (this.level === null) {
      try {
        if (existsSync(USER_SETTINGS_PATH)) {
          const settingsData = readFileSync(USER_SETTINGS_PATH, 'utf-8');
          const settings = JSON.parse(settingsData);
          const envLevel = (settings.TOTALRECALL_LOG_LEVEL || settings.CONTEXTKIT_LOG_LEVEL || 'INFO').toUpperCase();
          this.level = LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
        } else {
          this.level = LogLevel.INFO;
        }
      } catch (error) {
        this.level = LogLevel.INFO;
      }
    }
    return this.level;
  }

  /**
   * Create correlation ID for tracking an observation through the pipeline
   */
  correlationId(sessionId: number, observationNum: number): string {
    return `obs-${sessionId}-${observationNum}`;
  }

  /**
   * Create session correlation ID
   */
  sessionId(sessionId: number): string {
    return `session-${sessionId}`;
  }

  /**
   * Format data for logging - create compact summaries instead of full dumps
   */
  private formatData(data: any): string {
    if (data === null || data === undefined) return '';
    if (typeof data === 'string') return data;
    if (typeof data === 'number') return data.toString();
    if (typeof data === 'boolean') return data.toString();

    if (typeof data === 'object') {
      if (data instanceof Error) {
        return this.getLevel() === LogLevel.DEBUG
          ? `${data.message}\n${data.stack}`
          : data.message;
      }

      if (Array.isArray(data)) {
        return `[${data.length} items]`;
      }

      const keys = Object.keys(data);
      if (keys.length === 0) return '{}';
      if (keys.length <= 3) {
        return JSON.stringify(data);
      }
      return `{${keys.length} keys: ${keys.slice(0, 3).join(', ')}...}`;
    }

    return String(data);
  }

  /**
   * Format timestamp in local timezone (YYYY-MM-DD HH:MM:SS.mmm)
   */
  private formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    component: Component,
    message: string,
    context?: LogContext,
    data?: any
  ): void {
    if (level < this.getLevel()) return;

    this.ensureLogFileInitialized();

    const timestamp = this.formatTimestamp(new Date());
    const levelStr = LogLevel[level].padEnd(5);
    const componentStr = component.padEnd(6);

    let correlationStr = '';
    if (context?.correlationId) {
      correlationStr = `[${context.correlationId}] `;
    } else if (context?.sessionId) {
      correlationStr = `[session-${context.sessionId}] `;
    }

    let dataStr = '';
    if (data !== undefined && data !== null) {
      if (data instanceof Error) {
        dataStr = this.getLevel() === LogLevel.DEBUG
          ? `\n${data.message}\n${data.stack}`
          : ` ${data.message}`;
      } else if (this.getLevel() === LogLevel.DEBUG && typeof data === 'object') {
        dataStr = '\n' + JSON.stringify(data, null, 2);
      } else {
        dataStr = ' ' + this.formatData(data);
      }
    }

    let contextStr = '';
    if (context) {
      const { sessionId, memorySessionId, correlationId, ...rest } = context;
      if (Object.keys(rest).length > 0) {
        const pairs = Object.entries(rest).map(([k, v]) => `${k}=${v}`);
        contextStr = ` {${pairs.join(', ')}}`;
      }
    }

    const logLine = `[${timestamp}] [${levelStr}] [${componentStr}] ${correlationStr}${message}${contextStr}${dataStr}`;

    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, logLine + '\n', 'utf8');
      } catch (error) {
        process.stderr.write(`[LOGGER] Failed to write to log file: ${error}\n`);
      }
    } else {
      process.stderr.write(logLine + '\n');
    }
  }

  // Public logging methods
  debug(component: Component, message: string, context?: LogContext, data?: any): void {
    this.log(LogLevel.DEBUG, component, message, context, data);
  }

  info(component: Component, message: string, context?: LogContext, data?: any): void {
    this.log(LogLevel.INFO, component, message, context, data);
  }

  warn(component: Component, message: string, context?: LogContext, data?: any): void {
    this.log(LogLevel.WARN, component, message, context, data);
  }

  error(component: Component, message: string, context?: LogContext, data?: any): void {
    this.log(LogLevel.ERROR, component, message, context, data);
  }

  /**
   * Log data flow: input → processing
   */
  dataIn(component: Component, message: string, context?: LogContext, data?: any): void {
    this.info(component, `→ ${message}`, context, data);
  }

  /**
   * Log data flow: processing → output
   */
  dataOut(component: Component, message: string, context?: LogContext, data?: any): void {
    this.info(component, `← ${message}`, context, data);
  }

  /**
   * Log successful completion
   */
  success(component: Component, message: string, context?: LogContext, data?: any): void {
    this.info(component, `✓ ${message}`, context, data);
  }

  /**
   * Log failure
   */
  failure(component: Component, message: string, context?: LogContext, data?: any): void {
    this.error(component, `✗ ${message}`, context, data);
  }

  /**
   * Log timing information
   */
  timing(component: Component, message: string, durationMs: number, context?: LogContext): void {
    this.info(component, `⏱ ${message}`, context, { duration: `${durationMs}ms` });
  }

  /**
   * Happy Path Error - logs when the expected "happy path" fails but we have a fallback
   */
  happyPathError<T = string>(
    component: Component,
    message: string,
    context?: LogContext,
    data?: any,
    fallback: T = '' as T
  ): T {
    const stack = new Error().stack || '';
    const stackLines = stack.split('\n');
    const callerLine = stackLines[2] || '';
    const callerMatch = callerLine.match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/);
    const location = callerMatch
      ? `${callerMatch[1].split('/').pop()}:${callerMatch[2]}`
      : 'unknown';

    const enhancedContext = {
      ...context,
      location
    };

    this.warn(component, `[HAPPY-PATH] ${message}`, enhancedContext, data);

    return fallback;
  }
}

// Export singleton instance
export const logger = new Logger();
