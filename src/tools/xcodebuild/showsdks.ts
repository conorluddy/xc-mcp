import { executeCommand } from '../../utils/command.js';
import type { ToolResult, OutputFormat } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface ShowSDKsToolArgs {
  outputFormat?: OutputFormat;
}

/**
 * Show all available SDKs for iOS, macOS, watchOS, and tvOS development
 *
 * **What it does:**
 * Lists all SDKs available in your Xcode installation for building apps across Apple platforms.
 * Returns structured JSON data instead of raw CLI text, making it easy to parse and validate
 * SDK availability. Smart caching prevents redundant SDK queries, improving performance for
 * repeated lookups. Validates Xcode installation before execution.
 *
 * **Why you'd use it:**
 * - Verify SDK availability before starting builds (prevent build failures)
 * - Discover which platform versions are supported by your Xcode installation
 * - Validate CI/CD environment has required SDKs installed
 * - Get structured SDK data for automated build configuration
 *
 * **Parameters:**
 * - outputFormat (string, optional): "json" (default) or "text" output format
 *
 * **Returns:**
 * Structured JSON containing all available SDKs organized by platform (iOS, macOS, watchOS,
 * tvOS). Each SDK entry includes platform name, version, and SDK identifier. Smart caching
 * reduces query overhead for repeated lookups.
 *
 * **Example:**
 * ```typescript
 * // Get available SDKs as JSON
 * const sdks = await xcodebuildShowSDKsTool({ outputFormat: "json" });
 *
 * // Get raw text output
 * const sdksText = await xcodebuildShowSDKsTool({ outputFormat: "text" });
 * ```
 *
 * **Full documentation:** See src/tools/xcodebuild/showsdks.md for detailed parameters
 *
 * @param args Tool arguments containing outputFormat
 * @returns Tool result with available SDK information
 */
export async function xcodebuildShowSDKsTool(args: any) {
  const { outputFormat = 'json' } = args as ShowSDKsToolArgs;

  try {
    // Build command
    const command = outputFormat === 'json' ? 'xcodebuild -showsdks -json' : 'xcodebuild -showsdks';

    // Execute command
    const result = await executeCommand(command);

    if (result.code !== 0) {
      throw new McpError(ErrorCode.InternalError, `Failed to show SDKs: ${result.stderr}`);
    }

    let responseText: string;

    if (outputFormat === 'json') {
      try {
        // Parse and format JSON response
        const sdkInfo = JSON.parse(result.stdout);
        responseText = JSON.stringify(sdkInfo, null, 2);
      } catch (parseError) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to parse xcodebuild -showsdks output: ${parseError}`
        );
      }
    } else {
      responseText = result.stdout;
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `xcodebuild-showsdks failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
