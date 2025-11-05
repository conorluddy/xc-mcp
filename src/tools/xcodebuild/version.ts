import { executeCommand } from '../../utils/command.js';
import type { ToolResult, OutputFormat } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface VersionToolArgs {
  sdk?: string;
  outputFormat?: OutputFormat;
}

/**
 * Get Xcode and SDK version information with structured output
 *
 * **What it does:**
 * Retrieves comprehensive version information about your Xcode installation and available SDKs.
 * Returns structured JSON data that's easy to parse and validate, eliminating the need to parse
 * raw command-line output. Validates Xcode installation before execution to provide clear
 * error messages if Xcode is not properly configured.
 *
 * **Why you'd use it:**
 * - Validate environment before running builds or tests (CI/CD validation)
 * - Check SDK availability for specific platform versions
 * - Ensure consistent Xcode versions across team or build environments
 * - Get structured version data for automated tooling and scripts
 *
 * **Parameters:**
 * - sdk (string, optional): Query specific SDK version (e.g., "iphoneos", "iphonesimulator")
 * - outputFormat (string, optional): "json" (default) or "text" output format
 *
 * **Returns:**
 * Structured JSON response containing Xcode version, build number, and SDK information.
 * Falls back gracefully to text format for older Xcode versions that don't support JSON output.
 *
 * **Example:**
 * ```typescript
 * // Get Xcode version as JSON
 * const result = await xcodebuildVersionTool({ outputFormat: "json" });
 *
 * // Query specific SDK
 * const sdkInfo = await xcodebuildVersionTool({ sdk: "iphoneos" });
 * ```
 *
 * **Full documentation:** See src/tools/xcodebuild/version.md for detailed parameters
 *
 * @param args Tool arguments containing sdk and outputFormat
 * @returns Tool result with version information
 */
export async function xcodebuildVersionTool(args: any) {
  const { sdk, outputFormat = 'json' } = args as VersionToolArgs;

  try {
    // Build command
    let command = 'xcodebuild -version';

    if (sdk) {
      command += ` -sdk ${sdk}`;
    }

    if (outputFormat === 'json') {
      command += ' -json';
    }

    // Execute command
    const result = await executeCommand(command);

    if (result.code !== 0) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get version information: ${result.stderr}`
      );
    }

    let responseText: string;

    if (outputFormat === 'json') {
      try {
        // Parse and format JSON response
        const versionInfo = JSON.parse(result.stdout);
        responseText = JSON.stringify(versionInfo, null, 2);
      } catch (_parseError) {
        // If JSON parsing fails, the output might be plain text
        // This can happen with older Xcode versions
        responseText = JSON.stringify(
          {
            version: result.stdout,
            format: 'text',
          },
          null,
          2
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
      `xcodebuild-version failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const XCODEBUILD_VERSION_DOCS = `
# xcodebuild-version

⚡ **Get Xcode and SDK version information** with structured output

## What it does

Retrieves comprehensive version information about your Xcode installation and available SDKs. Returns structured JSON data that's easy to parse and validate, eliminating the need to parse raw command-line output. Validates Xcode installation before execution to provide clear error messages if Xcode is not properly configured.

## Why you'd use it

- Validate environment before running builds or tests (CI/CD validation)
- Check SDK availability for specific platform versions
- Ensure consistent Xcode versions across team or build environments
- Get structured version data for automated tooling and scripts

## Parameters

### Optional
- **sdk** (string): Query specific SDK version (e.g., "iphoneos", "iphonesimulator")
- **outputFormat** (string, default: 'json'): "json" or "text" output format

## Returns

Structured JSON response containing Xcode version, build number, and SDK information. Falls back gracefully to text format for older Xcode versions that don't support JSON output.

## Examples

### Get Xcode version as JSON
\`\`\`typescript
const result = await xcodebuildVersionTool({ outputFormat: "json" });
\`\`\`

### Query specific SDK
\`\`\`typescript
const sdkInfo = await xcodebuildVersionTool({ sdk: "iphoneos" });
\`\`\`

## Related Tools

- xcodebuild-showsdks: Show all available SDKs
- xcodebuild-list: List project information
`;
