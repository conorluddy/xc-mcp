# PRIORITY-2: Scheme Inspector Tool

**Status:** Pending
**Priority:** 2 - Medium Impact
**Effort:** Small
**Impact:** Medium - Helps understand scheme configuration
**Depends on:** None

## Problem Statement

Xcode schemes contain important configuration (build configuration, environment variables, arguments, tests, etc.) but there's no way to inspect them programmatically. Users must:

1. Open Xcode UI
2. Navigate to Product → Scheme → Edit Scheme
3. Manually read configuration
4. Note down any important settings

This is inconvenient for automation and AI agents trying to understand project setup.

## Proposed Solution

Create an `inspect-scheme` tool that:

1. Finds and parses `.xcscheme` file (XML format)
2. Extracts build, run, test configurations
3. Shows environment variables and arguments
4. Lists test targets included in test action
5. Displays pre/post-action scripts
6. Provides usage guidance

### Implementation

Create new file: `src/tools/xcodebuild/inspect-scheme.ts`

```typescript
import { readFileSync } from 'fs';
import { glob } from 'glob';
import { parseStringPromise } from 'xml2js';
import { basename, dirname } from 'path';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface SchemeAction {
  buildConfiguration?: string;
  environmentVariables?: Record<string, string>;
  commandLineArguments?: string[];
  preActions?: Array<{ script: string }>;
  postActions?: Array<{ script: string }>;
}

export interface SchemeInfo {
  name: string;
  path: string;
  launchAction: SchemeAction & { executable?: string };
  testAction: SchemeAction & { testTargets?: string[] };
  buildAction: SchemeAction;
}

async function findSchemeFile(
  projectPath: string,
  schemeName: string
): Promise<string | null> {
  // .xcscheme files are in XcodeProj/xcshareddata/xcschemes/
  const searchPath = `${dirname(projectPath)}/xcshareddata/xcschemes`;
  const schemeFiles = await glob('**/*.xcscheme', {
    cwd: searchPath,
  });

  for (const file of schemeFiles) {
    if (basename(file, '.xcscheme') === schemeName) {
      return `${searchPath}/${file}`;
    }
  }

  return null;
}

export async function inspectSchemeTool(args: any) {
  const { projectPath, scheme } = args;

  if (!projectPath || !scheme) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'projectPath and scheme are required'
    );
  }

  try {
    // Find scheme file
    const schemeFile = await findSchemeFile(projectPath, scheme);

    if (!schemeFile) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Scheme "${scheme}" not found. Use xcodebuild-list to see available schemes.`
      );
    }

    // Read and parse XML
    const schemeXml = readFileSync(schemeFile, 'utf-8');
    const schemeObj = await parseStringPromise(schemeXml);

    const scheme_element = schemeObj.Scheme;

    if (!scheme_element) {
      throw new Error('Invalid scheme file structure');
    }

    const responseData: any = {
      scheme: scheme,
      path: schemeFile,
      configuration: {
        launchAction: {
          buildConfiguration:
            scheme_element.LaunchAction?.[0]?.$?.buildConfiguration,
          executable: scheme_element.LaunchAction?.[0]?.$?.executable,
          environmentVariables: parseEnvironmentVariables(
            scheme_element.LaunchAction?.[0]?.EnvironmentVariables
          ),
          commandLineArguments: parseCommandLineArguments(
            scheme_element.LaunchAction?.[0]?.CommandLineArguments
          ),
          preActions: parseActions(
            scheme_element.LaunchAction?.[0]?.PreActions
          ),
          postActions: parseActions(
            scheme_element.LaunchAction?.[0]?.PostActions
          ),
        },
        testAction: {
          buildConfiguration:
            scheme_element.TestAction?.[0]?.$?.buildConfiguration,
          testTargets: parseTestTargets(
            scheme_element.TestAction?.[0]?.Testables
          ),
          environmentVariables: parseEnvironmentVariables(
            scheme_element.TestAction?.[0]?.EnvironmentVariables
          ),
          commandLineArguments: parseCommandLineArguments(
            scheme_element.TestAction?.[0]?.CommandLineArguments
          ),
          preActions: parseActions(scheme_element.TestAction?.[0]?.PreActions),
          postActions: parseActions(
            scheme_element.TestAction?.[0]?.PostActions
          ),
        },
        buildAction: {
          buildConfiguration:
            scheme_element.BuildAction?.[0]?.$?.buildConfiguration,
          preActions: parseActions(
            scheme_element.BuildAction?.[0]?.PreActions
          ),
          postActions: parseActions(
            scheme_element.BuildAction?.[0]?.PostActions
          ),
        },
      },
    };

    return {
      scheme: scheme,
      configuration: responseData.configuration,
      summary: {
        launchBuildConfig: responseData.configuration.launchAction.buildConfiguration,
        testBuildConfig: responseData.configuration.testAction.buildConfiguration,
        testTargets: responseData.configuration.testAction.testTargets || [],
        environmentVariables: Object.keys(
          responseData.configuration.launchAction.environmentVariables || {}
        ).length,
        launchArguments: responseData.configuration.launchAction
          .commandLineArguments?.length || 0,
      },
      guidance: [
        `Build for launch: ${responseData.configuration.launchAction.buildConfiguration}`,
        `Build for testing: ${responseData.configuration.testAction.buildConfiguration}`,
        `Test targets: ${responseData.configuration.testAction.testTargets?.join(', ') || 'Default'}`,
        '',
        'To run this scheme:',
        `  xcodebuild-build projectPath: "..." scheme: "${scheme}"`,
        `  xcodebuild-test projectPath: "..." scheme: "${scheme}"`,
        '',
        'To run with custom arguments:',
        `  xcodebuild-build projectPath: "..." scheme: "${scheme}" ...`,
      ],
    };
  } catch (error) {
    if (error instanceof McpError) throw error;

    throw new McpError(
      ErrorCode.InternalError,
      `Error inspecting scheme: ${error}`
    );
  }
}

function parseEnvironmentVariables(
  envVarsXml: any
): Record<string, string> {
  if (!envVarsXml || !envVarsXml[0]?.EnvironmentVariable) {
    return {};
  }

  const variables: Record<string, string> = {};

  for (const envVar of envVarsXml[0].EnvironmentVariable) {
    const name = envVar.$?.name;
    const value = envVar.$?.value;

    if (name && value) {
      variables[name] = value;
    }
  }

  return variables;
}

function parseCommandLineArguments(argsXml: any): string[] {
  if (!argsXml || !argsXml[0]?.CommandLineArgument) {
    return [];
  }

  const args: string[] = [];

  for (const arg of argsXml[0].CommandLineArgument) {
    const value = arg.$?.value;
    const enabled = arg.$?.isEnabled !== 'NO';

    if (value && enabled) {
      args.push(value);
    }
  }

  return args;
}

function parseTestTargets(testablesXml: any): string[] {
  if (!testablesXml || !testablesXml[0]?.TestableReference) {
    return [];
  }

  const targets: string[] = [];

  for (const testable of testablesXml[0].TestableReference) {
    const targetName = testable.BuildableReference?.[0]?.$?.BlueprintName;

    if (targetName) {
      targets.push(targetName);
    }
  }

  return targets;
}

function parseActions(actionsXml: any): Array<{ script: string }> {
  if (!actionsXml || !actionsXml[0]?.ExecutionAction) {
    return [];
  }

  const actions: Array<{ script: string }> = [];

  for (const action of actionsXml[0].ExecutionAction) {
    const script = action.ActionContent?.[0]?.ActionScript?.[0];

    if (script) {
      actions.push({ script });
    }
  }

  return actions;
}
```

Add to `src/index.ts`:

```typescript
{
  name: 'inspect-scheme',
  description: `🔍 **Inspect Xcode scheme configuration**

Shows build configurations, environment variables, command-line arguments, and test targets for a scheme.

Useful for:
• Understanding scheme configuration before building
• Seeing environment variables set by scheme
• Identifying test targets included in scheme
• Debugging build or test setup issues
• Automation and CI/CD (determine right configuration)`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to .xcodeproj or .xcworkspace',
      },
      scheme: {
        type: 'string',
        description: 'Scheme name to inspect',
      },
    },
    required: ['projectPath', 'scheme'],
  },
},
```

## Implementation Checklist

- [ ] Create `src/tools/xcodebuild/inspect-scheme.ts`
- [ ] Find `.xcscheme` file in xcshareddata directory
- [ ] Parse XML structure correctly
- [ ] Extract LaunchAction configuration
- [ ] Extract TestAction configuration
- [ ] Extract BuildAction configuration
- [ ] Parse environment variables
- [ ] Parse command-line arguments
- [ ] Parse pre/post-action scripts
- [ ] Parse test targets
- [ ] Handle missing scheme gracefully
- [ ] Format response with summary
- [ ] Add xml2js dependency if not present
- [ ] Unit tests for XML parsing
- [ ] Integration tests with real schemes
- [ ] Register tool in main server
- [ ] Update CLAUDE.md
- [ ] Add examples to README

## Testing Requirements

### Unit Tests

- [ ] Parses valid scheme XML
- [ ] Extracts environment variables correctly
- [ ] Extracts command-line arguments correctly
- [ ] Extracts test targets correctly
- [ ] Handles missing elements gracefully
- [ ] Finds scheme file in correct directory

### Integration Tests

- [ ] Works with real Xcode project
- [ ] Correctly identifies build configurations
- [ ] Correctly identifies test targets
- [ ] Handles scheme with no environment variables
- [ ] Handles scheme with no test targets

### Manual Testing

- [ ] Inspect your project's main scheme
- [ ] Verify build configurations match Xcode
- [ ] Verify environment variables are correct
- [ ] Verify test targets are correct

## Related Tickets

- **Depends on:** None
- **Complements:**
  - PRIORITY-2-TEST-PLAN-DISCOVERY
  - PRIORITY-2-BUILD-AND-RUN-WORKFLOW
- **Works with:** xcodebuild-build, xcodebuild-test

## Notes

### Scheme File Location

Scheme files are stored at:
```
MyProject.xcodeproj/xcshareddata/xcschemes/MyScheme.xcscheme
```

They're XML files that can be parsed with standard XML libraries.

### Future Enhancements

- Show scheme edit history
- Compare multiple schemes
- Detect common misconfiguration issues
- Suggest optimal configurations
- Support for workspace-level schemes
