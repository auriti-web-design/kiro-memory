/**
 * Stub for @modelcontextprotocol/sdk/server/mcp — prevents OOM from Zod v4 type resolution.
 * See issue #67.
 */
export declare class McpServer {
  readonly server: any;
  constructor(serverInfo: { name: string; version: string }, options?: Record<string, unknown>);
  registerTool(name: string, config: Record<string, unknown>, handler: (...args: any[]) => any): void;
  connect(transport: any): Promise<void>;
  close(): Promise<void>;
}
