# PRIORITY-2: Test Plan Discovery Tool

**Status:** Pending
**Priority:** 2 - Medium Impact
**Effort:** Small
**Impact:** Medium - Helps discover and configure test plans
**Depends on:** None

## Problem Statement

`xcodebuild-test` tool accepts `testPlan` parameter, but users have no way to discover available test plans. Test plans are defined in `.xctestplan` JSON files in the project, but there's no tool to list them.

Current friction:
1. User doesn't know what test plans are available
2. Can't see test plan configuration (which tests, execution order, etc.)
3. Must manually explore project files or Xcode UI
4. Can't verify test plan before running tests

## Proposed Solution

Create a `list-test-plans` tool that:

1. Finds all `.xctestplan` files in project
2. Parses JSON to extract configuration
3. Lists test targets included in each plan
4. Shows execution settings and options
5. Provides usage guidance

### Implementation

Create new file: `src/tools/xcodebuild/list-test-plans.ts`

```typescript
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { basename, dirname } from 'path';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface TestPlan {
  name: string;
  path: string;
  configurations?: string[];
  testTargets?: Array<{
    name: string;
    skipped: boolean;
  }>;
  executionTimeAllowance?: number;
  parallelizationEnabled?: boolean;
  defaultCodeCoverage?: boolean;
  preActions?: any[];
  postActions?: any[];
}

export async function listTestPlansTool(args: any) {
  const { projectPath } = args;

  if (!projectPath) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'projectPath is required'
    );
  }

  const responseData: any = {
    testPlans: [],
    summary: {
      total: 0,
      defaultPlan: null,
    },
  };

  try {
    // Find all .xctestplan files
    const projectDir = dirname(projectPath);
    const testPlanFiles = await glob('**/*.xctestplan', {
      cwd: projectDir,
      absolute: true,
    });

    if (testPlanFiles.length === 0) {
      return {
        testPlans: [],
        summary: { total: 0 },
        guidance: [
          'No test plans found in project',
          'Create a test plan in Xcode:',
          '  1. Open Xcode project',
          '  2. Product → Test Plan → New Test Plan',
          '  3. Configure test targets and settings',
          '  4. Save test plan',
          'Or run all tests: xcodebuild-test scheme: "..."',
        ],
      };
    }

    // Parse each test plan file
    for (const planPath of testPlanFiles) {
      try {
        const content = readFileSync(planPath, 'utf-8');
        const planJson = JSON.parse(content);

        const planName = basename(planPath, '.xctestplan');

        const testPlan: TestPlan = {
          name: planName,
          path: planPath,
          configurations: planJson.configurations?.map((c: any) => c.name),
          testTargets: planJson.testTargets?.map((t: any) => ({
            name: t.target?.name || 'Unknown',
            skipped: t.skipped === true,
          })),
          executionTimeAllowance: planJson.defaultOptions?.defaultTestExecutionTimeAllowance,
          parallelizationEnabled: planJson.defaultOptions?.parallelizeTargets,
          defaultCodeCoverage: planJson.defaultOptions?.codeCoverageEnabled,
          preActions: planJson.preActions,
          postActions: planJson.postActions,
        };

        responseData.testPlans.push({
          name: testPlan.name,
          configuration: {
            configurations: testPlan.configurations,
            testTargets: testPlan.testTargets,
            executionTimeAllowance: testPlan.executionTimeAllowance,
            parallelizationEnabled: testPlan.parallelizationEnabled,
            codeCoverageEnabled: testPlan.defaultCodeCoverage,
          },
          summary: {
            totalTargets: testPlan.testTargets?.length || 0,
            skippedTargets: testPlan.testTargets?.filter(t => t.skipped).length || 0,
            enabledTargets: testPlan.testTargets?.filter(t => !t.skipped).length || 0,
          },
          path: planPath,
          usage: `xcodebuild-test scheme: "..." testPlan: "${testPlan.name}"`,
        });
      } catch (error) {
        console.error(`Error parsing test plan ${planPath}:`, error);
        // Continue with other plans
      }
    }

    responseData.summary.total = responseData.testPlans.length;

    // Find default plan (same name as scheme if exists)
    if (args.scheme) {
      responseData.summary.defaultPlan = responseData.testPlans.find(
        (p: any) => p.name === args.scheme
      )?.name;
    }

    // Sort by name
    responseData.testPlans.sort((a: any, b: any) =>
      a.name.localeCompare(b.name)
    );

    return {
      testPlans: responseData.testPlans,
      summary: responseData.summary,
      guidance: [
        `Found ${responseData.testPlans.length} test plan(s)`,
        '',
        'To run a test plan:',
        `  xcodebuild-test projectPath: "..." scheme: "..." testPlan: "<plan-name>"`,
        '',
        'Examples:',
        ...responseData.testPlans.slice(0, 3).map((p: any) =>
          `  xcodebuild-test scheme: "..." testPlan: "${p.name}"`
        ),
        '',
        'To run all tests without a specific plan:',
        `  xcodebuild-test scheme: "..."`,
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Error listing test plans: ${error}`
    );
  }
}
```

Add to `src/index.ts`:

```typescript
{
  name: 'list-test-plans',
  description: `📋 **Discover available test plans in your project**

Lists all .xctestplan files with their configuration and test targets.

Useful for:
• Discovering available test plans
• Seeing which tests are included in each plan
• Understanding test configuration (parallelization, coverage, etc.)
• Choosing the right plan for your testing needs

Before running tests, use this to see what test plans are available.`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to .xcodeproj or .xcworkspace',
      },
      scheme: {
        type: 'string',
        description: 'Optional: Scheme name to find matching test plan',
      },
    },
    required: ['projectPath'],
  },
},
```

## Implementation Checklist

- [ ] Create `src/tools/xcodebuild/list-test-plans.ts`
- [ ] Find `.xctestplan` files using glob
- [ ] Parse JSON structure correctly
- [ ] Extract test targets from plan
- [ ] Extract configuration settings
- [ ] Handle missing or malformed test plans gracefully
- [ ] Format response with summary and usage examples
- [ ] Provide helpful guidance for test plan usage
- [ ] Register tool in main server
- [ ] Unit tests for JSON parsing
- [ ] Integration tests with real projects
- [ ] Test with projects that have no test plans
- [ ] Update CLAUDE.md
- [ ] Add examples to README

## Testing Requirements

### Unit Tests

- [ ] Parses valid test plan JSON
- [ ] Handles missing test plan files
- [ ] Handles malformed JSON gracefully
- [ ] Extracts test targets correctly
- [ ] Extracts configuration correctly
- [ ] Sorts plans alphabetically

### Integration Tests

- [ ] Works with real Xcode project with test plans
- [ ] Works with project without test plans (helpful message)
- [ ] Works with multiple test plans
- [ ] Detects parallelization settings

### Manual Testing

- [ ] List test plans for your project
- [ ] Verify test targets are correct
- [ ] Verify configuration matches Xcode
- [ ] Use suggested command to run test plan

## Related Tickets

- **Depends on:** None
- **Complements:** PRIORITY-2-BUILD-AND-RUN-WORKFLOW
- **Works with:** xcodebuild-test tool

## Notes

### Test Plan File Structure

`.xctestplan` is a JSON file containing:

```json
{
  "configurations": [
    { "id": "config1", "name": "Debug" }
  ],
  "defaultOptions": {
    "parallelizeTargets": true,
    "codeCoverageEnabled": false,
    "defaultTestExecutionTimeAllowance": 600
  },
  "testTargets": [
    {
      "skipped": false,
      "target": {
        "name": "MyAppTests"
      }
    }
  ],
  "preActions": [],
  "postActions": []
}
```

### Future Enhancements

- Show test execution order
- Display code coverage settings
- Show pre/post-action configurations
- Compare test plans
- Create test plan recommendations based on project structure
