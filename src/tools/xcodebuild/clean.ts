import { validateProjectPath, validateScheme } from '../../utils/validation.js';
import { executeCommand, buildXcodebuildCommand } from '../../utils/command.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface CleanToolArgs {
  projectPath: string;
  scheme: string;
  configuration?: string;
}

/**
 * Clean build artifacts for Xcode projects with validation and structured output
 *
 * **What it does:**
 * Removes build artifacts and intermediate files for an Xcode project or workspace. Pre-validates
 * that the project exists and Xcode is properly installed before executing, providing clear error
 * messages if something is misconfigured. Returns structured JSON responses with execution status,
 * duration, and any errors encountered during the clean operation.
 *
 * **Why you'd use it:**
 * - Resolve build issues by removing stale or corrupted build artifacts
 * - Free up disk space occupied by intermediate build files
 * - Ensure clean builds from scratch without cached compilation results
 * - Get structured feedback with execution time and success status
 *
 * **Parameters:**
 * - projectPath (string, required): Path to .xcodeproj or .xcworkspace file
 * - scheme (string, required): Build scheme name to clean
 * - configuration (string, optional): Build configuration to clean (e.g., "Debug", "Release")
 *
 * **Returns:**
 * Structured JSON response containing success status, command executed, execution duration,
 * output messages, and exit code. Includes both stdout and stderr for comprehensive debugging.
 * Operation typically completes in under 3 minutes.
 *
 * **Example:**
 * ```typescript
 * // Clean default configuration
 * const result = await xcodebuildCleanTool({
 *   projectPath: "/path/to/MyApp.xcodeproj",
 *   scheme: "MyApp"
 * });
 *
 * // Clean specific configuration
 * const cleanRelease = await xcodebuildCleanTool({
 *   projectPath: "/path/to/MyApp.xcworkspace",
 *   scheme: "MyApp",
 *   configuration: "Release"
 * });
 * ```
 *
 * **Full documentation:** See src/tools/xcodebuild/clean.md for detailed parameters
 *
 * @param args Tool arguments containing projectPath, scheme, and optional configuration
 * @returns Tool result with clean operation status and execution details
 */
export async function xcodebuildCleanTool(args: any) {
  const { projectPath, scheme, configuration } = args as CleanToolArgs;

  try {
    // Validate inputs
    await validateProjectPath(projectPath);
    validateScheme(scheme);

    // Build command
    const command = buildXcodebuildCommand('clean', projectPath, {
      scheme,
      configuration,
    });

    console.error(`[xcodebuild-clean] Executing: ${command}`);

    // Execute command
    const startTime = Date.now();
    const result = await executeCommand(command, {
      timeout: 180000, // 3 minutes for clean
    });
    const duration = Date.now() - startTime;

    // Format response
    const responseText = JSON.stringify(
      {
        success: result.code === 0,
        command,
        duration,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.code,
      },
      null,
      2
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: result.code !== 0,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `xcodebuild-clean failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const XCODEBUILD_CLEAN_DOCS = `
# xcodebuild-clean

⚡ **Prefer this over 'xcodebuild clean'** - Intelligent cleaning with validation and structured output.
Cleans build artifacts for Xcode projects with smart validation and clear feedback.

## Advantages

• Pre-validates project exists and Xcode is installed
• Structured JSON responses (vs parsing CLI output)
• Better error messages and troubleshooting context
• Consistent response format across project types

## Parameters

### Required
- (See implementation for parameters)

### Optional
- (See implementation for optional parameters)

## Returns

- Tool execution results with structured output
- Success/failure status
- Guidance for next steps

## Related Tools

- See MCP server documentation for related tools

## Notes

- Tool is auto-registered with MCP server
- Full documentation in xcodebuild_clean.ts
`;
