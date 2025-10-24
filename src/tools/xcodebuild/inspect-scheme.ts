import { readFileSync } from 'fs';
import { basename, dirname } from 'path';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Inspect Xcode Scheme Configuration
 *
 * Parse and display scheme build, run, and test configurations
 *
 * Full documentation: See src/tools/xcodebuild/inspect-scheme.md
 *
 * @param args Tool arguments
 * @returns Parsed scheme information
 */
export async function inspectSchemeTool(args: any) {
  const { projectPath, scheme } = args;

  if (!projectPath || !scheme) {
    throw new McpError(ErrorCode.InvalidRequest, 'projectPath and scheme are required');
  }

  try {
    // Find .xcscheme file
    const schemeFile = await findSchemeFile(projectPath, scheme);
    if (!schemeFile) {
      throw new McpError(ErrorCode.InvalidRequest, `Scheme "${scheme}" not found in project`);
    }

    // Parse XML (using simple string parsing since xml2js might not be available)
    const schemeXml = readFileSync(schemeFile, 'utf-8');
    const schemeInfo = parseXmlScheme(schemeXml, scheme, schemeFile);

    const responseData = {
      success: true,
      scheme: {
        name: schemeInfo.name,
        path: schemeInfo.path,
        launchConfiguration: schemeInfo.launchConfiguration,
        testConfiguration: schemeInfo.testConfiguration,
        buildConfiguration: schemeInfo.buildConfiguration,
        buildSettings: schemeInfo.buildSettings,
      },
      guidance: [
        `Scheme: ${scheme}`,
        `Build Config: ${schemeInfo.buildConfiguration.configuration}`,
        `Launch Config: ${schemeInfo.launchConfiguration.configuration}`,
        `Test Config: ${schemeInfo.testConfiguration.configuration}`,
        ...(schemeInfo.launchConfiguration.environmentVariables.length > 0
          ? [`Environment variables: ${schemeInfo.launchConfiguration.environmentVariables.length}`]
          : []),
      ],
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [{ type: 'text' as const, text: responseText }],
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to inspect scheme: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function findSchemeFile(projectPath: string, schemeName: string): Promise<string | null> {
  try {
    // Find .xcscheme files in project's schemes directory
    const projectDir = dirname(projectPath);
    const schemeDir = `${projectDir}/xcshareddata/xcschemes`;

    // Simple file search without glob library to avoid require
    const { readdirSync, existsSync } = await import('fs');
    if (!existsSync(schemeDir)) {
      return null;
    }

    const files = readdirSync(schemeDir).filter(f => f.endsWith('.xcscheme'));

    for (const file of files) {
      if (basename(file, '.xcscheme') === schemeName) {
        return `${schemeDir}/${file}`;
      }
    }
  } catch {
    // Directory might not exist
  }

  return null;
}

function parseXmlScheme(xml: string, name: string, path: string): any {
  // Simple XML parsing without requiring xml2js
  const schemeInfo: any = {
    name,
    path,
    launchConfiguration: { configuration: 'Debug', environmentVariables: [] },
    testConfiguration: { configuration: 'Debug', environmentVariables: [] },
    buildConfiguration: { configuration: 'Debug', environmentVariables: [] },
    buildSettings: {},
  };

  // Extract BuildActionEntry for build configuration
  const buildMatch = xml.match(/BuildActionEntry[\s\S]*?buildForRunning = "([^"]+)"/);
  if (buildMatch) {
    schemeInfo.buildConfiguration.configuration = 'Debug';
  }

  // Extract LaunchAction for launch configuration
  const launchMatch = xml.match(
    /<LaunchAction[\s\S]*?buildConfiguration = "([^"]+)"[\s\S]*?>([\s\S]*?)<\/LaunchAction>/
  );
  if (launchMatch) {
    schemeInfo.launchConfiguration.configuration = launchMatch[1];

    // Extract environment variables
    const envMatches = launchMatch[2].matchAll(
      /<EnvironmentVariable\s+name = "([^"]+)"\s+value = "([^"]+)"/g
    );
    for (const envMatch of envMatches) {
      schemeInfo.launchConfiguration.environmentVariables.push({
        name: envMatch[1],
        value: envMatch[2],
      });
    }
  }

  // Extract TestAction for test configuration
  const testMatch = xml.match(
    /<TestAction[\s\S]*?buildConfiguration = "([^"]+)"[\s\S]*?>([\s\S]*?)<\/TestAction>/
  );
  if (testMatch) {
    schemeInfo.testConfiguration.configuration = testMatch[1];

    // Extract test targets
    const testTargets: string[] = [];
    const targetMatches = testMatch[2].matchAll(/<TestableReference[\s\S]*?></g);
    for (const _ of targetMatches) {
      testTargets.push('TestTarget');
    }
    schemeInfo.testConfiguration.testTargets = testTargets;
  }

  return schemeInfo;
}
