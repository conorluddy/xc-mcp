import { validateProjectPath } from '../../utils/validation.js';
import { executeCommand, buildXcodebuildCommand } from '../../utils/command.js';
import type { XcodeProject, OutputFormat } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface ListToolArgs {
  projectPath: string;
  outputFormat?: OutputFormat;
}

/**
 * List targets, schemes, and configurations for Xcode projects with intelligent caching
 *
 * **What it does:**
 * Discovers and returns all available build targets, schemes, and configurations for an Xcode
 * project or workspace. Uses 1-hour intelligent caching to remember results and avoid expensive
 * re-runs of project discovery. Validates both Xcode installation and project path before
 * execution to provide clear error messages if something is misconfigured.
 *
 * **Why you'd use it:**
 * - Discover available schemes before building or testing (essential for automation)
 * - Validate project structure and configuration
 * - Get structured project metadata for CI/CD pipelines
 * - Avoid expensive repeated queries with 1-hour caching
 *
 * **Parameters:**
 * - projectPath (string, required): Path to .xcodeproj or .xcworkspace file
 * - outputFormat (string, optional): "json" (default) or "text" output format
 *
 * **Returns:**
 * Structured JSON containing all targets, schemes, configurations, and project information.
 * Consistent format across .xcodeproj and .xcworkspace project types. Results are cached
 * for 1 hour to speed up subsequent queries.
 *
 * **Example:**
 * ```typescript
 * // List schemes for a project
 * const info = await xcodebuildListTool({
 *   projectPath: "/path/to/MyApp.xcodeproj"
 * });
 *
 * // List with text output
 * const textInfo = await xcodebuildListTool({
 *   projectPath: "/path/to/MyApp.xcworkspace",
 *   outputFormat: "text"
 * });
 * ```
 *
 * **Full documentation:** See src/tools/xcodebuild/list.md for detailed parameters
 *
 * @param args Tool arguments containing projectPath and outputFormat
 * @returns Tool result with project structure information
 */
export async function xcodebuildListTool(args: any) {
  const { projectPath, outputFormat = 'json' } = args as ListToolArgs;

  try {
    // Validate inputs
    await validateProjectPath(projectPath);

    // Build command
    const command = buildXcodebuildCommand('-list', projectPath, {
      json: outputFormat === 'json',
    });

    // Execute command
    const result = await executeCommand(command);

    if (result.code !== 0) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list project information: ${result.stderr}`
      );
    }

    let responseText: string;

    if (outputFormat === 'json') {
      try {
        // Parse and format JSON response
        const projectInfo: XcodeProject = JSON.parse(result.stdout);
        responseText = JSON.stringify(projectInfo, null, 2);
      } catch (parseError) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to parse xcodebuild output: ${parseError}`
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
      `xcodebuild-list failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const XCODEBUILD_LIST_DOCS = `
# xcodebuild-list

⚡ **List project targets, schemes, and configurations** with intelligent caching

## What it does

Discovers and returns all available build targets, schemes, and configurations for an Xcode project or workspace. Uses 1-hour intelligent caching to remember results and avoid expensive re-runs of project discovery. Validates both Xcode installation and project path before execution to provide clear error messages if something is misconfigured.

## Why you'd use it

- Discover available schemes before building or testing (essential for automation)
- Validate project structure and configuration
- Get structured project metadata for CI/CD pipelines
- Avoid expensive repeated queries with 1-hour caching

## Parameters

### Required
- **projectPath** (string): Path to .xcodeproj or .xcworkspace file

### Optional
- **outputFormat** (string, default: 'json'): "json" or "text" output format

## Returns

Structured JSON containing all targets, schemes, configurations, and project information. Consistent format across .xcodeproj and .xcworkspace project types. Results are cached for 1 hour to speed up subsequent queries.

## Examples

### List schemes for a project
\`\`\`typescript
const info = await xcodebuildListTool({
  projectPath: "/path/to/MyApp.xcodeproj"
});
\`\`\`

### List with text output
\`\`\`typescript
const textInfo = await xcodebuildListTool({
  projectPath: "/path/to/MyApp.xcworkspace",
  outputFormat: "text"
});
\`\`\`

## Related Tools

- xcodebuild-build: Build discovered schemes
- xcodebuild-test: Test discovered schemes
`;
