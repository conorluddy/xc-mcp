// Mock MCP SDK types for testing
export enum ErrorCode {
  InvalidParams = -32602,
  InternalError = -32603,
}

export class McpError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'McpError';
  }
}
