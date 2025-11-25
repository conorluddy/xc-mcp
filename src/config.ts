/**
 * CLI configuration for XC-MCP server
 * Parses command line arguments and environment variables
 */

export interface MCPConfig {
  /** Use minimal tool descriptions (~70 chars) instead of full docs */
  minimalDescriptions: boolean;
  /** Enable defer_loading hint for MCP clients that support it */
  deferLoading: boolean;
}

function parseArgs(): MCPConfig {
  const args = process.argv.slice(2);
  return {
    minimalDescriptions: args.includes('--mini') || args.includes('-m'),
    deferLoading: process.env.XC_MCP_DEFER_LOADING !== 'false',
  };
}

export const config = parseArgs();
