/**
 * CLI configuration for XC-MCP server
 * Parses command line arguments and environment variables
 */

export interface MCPConfig {
  /** Use minimal tool descriptions (~70 chars) instead of full docs */
  minimalDescriptions: boolean;
  /** Load only build-related tools (xcodebuild, simctl-list, cache, system) */
  buildOnly: boolean;
}

function parseArgs(): MCPConfig {
  const args = process.argv.slice(2);
  return {
    minimalDescriptions: args.includes('--mini') || args.includes('-m'),
    buildOnly: args.includes('--build-only') || args.includes('-b'),
  };
}

export const config = parseArgs();
