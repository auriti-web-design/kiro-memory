/**
 * Stub for @modelcontextprotocol/sdk/server/stdio — prevents OOM from Zod v4 type resolution.
 * See issue #67.
 */
export declare class StdioServerTransport {
  constructor();
  start(): Promise<void>;
  close(): Promise<void>;
}
