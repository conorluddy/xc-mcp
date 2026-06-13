import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// === TYPES ===

interface TestRecordReportArgs {
  sessionName: string;
  testName?: string;
}

interface StepRecord {
  index: number;
  label: string;
  timestampMs: number;
  screenshot: string;
  accessibilityFile: string;
  elementCount: number;
  assertion?: string;
  metadata?: Record<string, unknown>;
}

interface SessionMeta {
  sessionName: string;
  startedAt: number;
  steps: StepRecord[];
}

// === HELPERS ===

function recordingsRoot(): string {
  return process.env.XC_MCP_RECORDINGS_DIR ?? path.join(os.homedir(), '.xc-mcp', 'test-recordings');
}

function sessionDir(sessionName: string): string {
  return path.join(recordingsRoot(), sessionName);
}

function stepsFile(sessionName: string): string {
  return path.join(sessionDir(sessionName), 'steps.json');
}

function readSession(sessionName: string): SessionMeta {
  const p = stepsFile(sessionName);
  if (!fs.existsSync(p)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Session "${sessionName}" not found at ${p}. Record steps first with test-record-step.`
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as SessionMeta;
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function buildMarkdown(session: SessionMeta, testName: string): string {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const totalDurationMs =
    session.steps.length > 0 ? session.steps[session.steps.length - 1].timestampMs : 0;

  const lines: string[] = [
    `# Test Report: ${testName}`,
    '',
    `**Date:** ${now}`,
    `**Session:** ${session.sessionName}`,
    `**Steps:** ${session.steps.length}`,
    `**Duration:** ${formatMs(totalDurationMs)}`,
    '',
    '## Test Steps',
    '',
  ];

  for (const step of session.steps) {
    lines.push(`### Step ${step.index}: ${step.label} (${formatMs(step.timestampMs)})`);
    lines.push('');
    lines.push(`![Screenshot](${step.screenshot})`);
    lines.push('');

    if (step.assertion) {
      lines.push(`**Assertion:** ${step.assertion}`);
      lines.push('');
    }

    if (step.metadata && Object.keys(step.metadata).length > 0) {
      lines.push('**Metadata:**');
      for (const [key, value] of Object.entries(step.metadata)) {
        lines.push(`- ${key}: ${String(value)}`);
      }
      lines.push('');
    }

    lines.push(`**Accessibility Elements:** ${step.elementCount}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total steps: ${session.steps.length}`);
  lines.push(`- Duration: ${formatMs(totalDurationMs)}`);
  lines.push(`- Screenshots: ${session.steps.length}`);
  lines.push(`- Accessibility snapshots: ${session.steps.length}`);
  lines.push('');

  return lines.join('\n');
}

// === MAIN TOOL EXPORT ===

/**
 * Generate a markdown report from a recorded test session.
 *
 * Examples:
 * - Basic report: sessionName: "login-flow"
 * - Named report: sessionName: "login-flow", testName: "Login Flow — Happy Path"
 *
 * Supports:
 * - Per-step screenshot image links
 * - Assertion status per step
 * - Arbitrary step metadata bullets
 * - Accessibility element counts
 * - Summary section
 *
 * **Full documentation:** Use rtfm({ toolName: "test-record-report" }) for detailed parameters
 */
export async function testRecordReportTool(args: any) {
  const { sessionName, testName } = args as TestRecordReportArgs;

  try {
    if (!sessionName || sessionName.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'sessionName is required and cannot be empty');
    }

    const session = readSession(sessionName);

    if (session.steps.length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Session "${sessionName}" has no recorded steps. Use test-record-step to record steps first.`
      );
    }

    const resolvedTestName = testName?.trim() || sessionName;
    const markdown = buildMarkdown(session, resolvedTestName);

    const reportPath = path.join(sessionDir(sessionName), 'report.md');
    fs.writeFileSync(reportPath, markdown, 'utf-8');

    console.error(`[test-record-report] Report written: ${reportPath}`);

    const guidance: string[] = [
      `✅ Report generated for session "${sessionName}"`,
      `Steps: ${session.steps.length}`,
      `Report: ${reportPath}`,
      `Open report: open "${reportPath}"`,
      `View screenshots: open "${path.join(sessionDir(sessionName), 'screenshots')}"`,
    ];

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              sessionName,
              testName: resolvedTestName,
              reportPath,
              stepCount: session.steps.length,
              markdown,
              guidance,
            },
            null,
            2
          ),
        },
      ],
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `test-record-report failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// === DOCUMENTATION ===

export const TEST_RECORD_REPORT_DOCS = `
# test-record-report

Generate a markdown report from a recorded test session created by test-record-step.

## What it does

Reads the session's \`steps.json\` and produces a structured \`report.md\` file:
- Header with test name, date, step count, and duration
- Per-step sections with screenshot image links, assertions, metadata, and element counts
- Summary section with totals

The report is written to \`<recordingsRoot>/<sessionName>/report.md\` and also returned
in the response for immediate consumption.

## Parameters

- **sessionName** (string, required): Session name matching prior test-record-step calls
- **testName** (string, optional): Title for the report (defaults to sessionName)

## Returns

JSON with \`{ sessionName, testName, reportPath, stepCount, markdown }\`
plus guidance. Throws McpError InvalidRequest if session or steps are missing.

## Examples

### Basic report
\`\`\`typescript
await testRecordReportTool({ sessionName: "login-flow" })
\`\`\`

### Named report
\`\`\`typescript
await testRecordReportTool({
  sessionName: "login-flow",
  testName: "Login Flow — Happy Path"
})
\`\`\`

## Typical Workflow

1. \`test-record-step({ sessionName: "my-test", label: "App launched" })\`
2. \`test-record-step({ sessionName: "my-test", label: "Login tapped", assertion: "Login form visible" })\`
3. \`test-record-step({ sessionName: "my-test", label: "Logged in", metadata: { user: "test@example.com" } })\`
4. \`test-record-report({ sessionName: "my-test", testName: "Login Flow" })\`
`;

export const TEST_RECORD_REPORT_DOCS_MINI =
  'Generate a markdown report from a recorded test session. Use rtfm({ toolName: "test-record-report" }) for docs.';
