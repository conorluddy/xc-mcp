import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// === TYPES ===

interface TestRecordStepArgs {
  sessionName: string;
  label: string;
  udid?: string;
  metadata?: Record<string, unknown>;
  assertion?: string;
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

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function zeroPad(n: number, width = 3): string {
  return String(n).padStart(width, '0');
}

function ensureSessionDir(sessionName: string): SessionMeta {
  const dir = sessionDir(sessionName);
  const screenshotsDir = path.join(dir, 'screenshots');
  const accessibilityDir = path.join(dir, 'accessibility');

  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(accessibilityDir, { recursive: true });

  const stepsPath = stepsFile(sessionName);
  if (!fs.existsSync(stepsPath)) {
    const initial: SessionMeta = {
      sessionName,
      startedAt: Date.now(),
      steps: [],
    };
    fs.writeFileSync(stepsPath, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  return JSON.parse(fs.readFileSync(stepsPath, 'utf-8')) as SessionMeta;
}

function writeSession(sessionName: string, meta: SessionMeta): void {
  fs.writeFileSync(stepsFile(sessionName), JSON.stringify(meta, null, 2), 'utf-8');
}

// === MAIN TOOL EXPORT ===

/**
 * Record a single step in a named test session with screenshot and accessibility snapshot.
 *
 * Examples:
 * - First step: sessionName: "login-flow", label: "App launched"
 * - With assertion: sessionName: "login-flow", label: "Login succeeded", assertion: "Home screen visible"
 * - With metadata: sessionName: "login-flow", label: "Credentials entered", metadata: { user: "test@example.com" }
 * - Specific device: sessionName: "login-flow", label: "App launched", udid: "device-123"
 *
 * Supports:
 * - Automatic screenshot capture via xcrun simctl io
 * - Accessibility tree snapshot via idb ui describe-all (tolerates idb absence)
 * - Sequential step indexing across calls
 * - Arbitrary metadata and optional assertions per step
 *
 * **Full documentation:** Use rtfm({ toolName: "test-record-step" }) for detailed parameters
 */
export async function testRecordStepTool(args: any) {
  const { sessionName, label, udid, metadata, assertion } = args as TestRecordStepArgs;

  try {
    if (!sessionName || sessionName.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'sessionName is required and cannot be empty');
    }
    if (!label || label.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'label is required and cannot be empty');
    }

    const session = ensureSessionDir(sessionName);
    const stepIndex = session.steps.length + 1;
    const paddedIndex = zeroPad(stepIndex);
    const safeLabel = sanitizeLabel(label);

    const dir = sessionDir(sessionName);
    const screenshotRelPath = path.join('screenshots', `${paddedIndex}-${safeLabel}.png`);
    const screenshotAbsPath = path.join(dir, screenshotRelPath);
    const accessibilityRelPath = path.join('accessibility', `${paddedIndex}-${safeLabel}.json`);
    const accessibilityAbsPath = path.join(dir, accessibilityRelPath);

    // Capture screenshot
    const deviceTarget = udid ? `"${udid}"` : 'booted';
    const screenshotCmd = `xcrun simctl io ${deviceTarget} screenshot "${screenshotAbsPath}"`;
    console.error(`[test-record-step] Screenshot: ${screenshotCmd}`);
    const screenshotResult = await executeCommand(screenshotCmd, { timeout: 15000 });
    const screenshotOk = screenshotResult.code === 0;

    // Capture accessibility tree (tolerate failure)
    let elementCount = 0;
    let accessibilityNote: string | undefined;
    try {
      const idbCmd = udid ? `idb ui describe-all --udid "${udid}"` : `idb ui describe-all`;
      console.error(`[test-record-step] Accessibility: ${idbCmd}`);
      const idbResult = await executeCommand(idbCmd, { timeout: 20000 });
      if (idbResult.code === 0 && idbResult.stdout) {
        // idb returns NDJSON — count lines that look like elements
        const lines = idbResult.stdout.split('\n').filter(l => l.trim().startsWith('{'));
        elementCount = lines.length;
        fs.writeFileSync(accessibilityAbsPath, idbResult.stdout, 'utf-8');
      } else {
        elementCount = 0;
        accessibilityNote = 'idb returned non-zero exit code';
        fs.writeFileSync(
          accessibilityAbsPath,
          JSON.stringify({ elementCount: 0, note: accessibilityNote }),
          'utf-8'
        );
      }
    } catch (idbError) {
      elementCount = 0;
      accessibilityNote = `idb unavailable: ${idbError instanceof Error ? idbError.message : String(idbError)}`;
      console.error(`[test-record-step] idb failed (tolerated): ${accessibilityNote}`);
      fs.writeFileSync(
        accessibilityAbsPath,
        JSON.stringify({ elementCount: 0, note: accessibilityNote }),
        'utf-8'
      );
    }

    // Build step record
    const timestampMs = Date.now() - session.startedAt;
    const stepRecord: StepRecord = {
      index: stepIndex,
      label,
      timestampMs,
      screenshot: screenshotRelPath,
      accessibilityFile: accessibilityRelPath,
      elementCount,
      ...(assertion !== undefined ? { assertion } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    };

    // Atomic append to steps.json
    session.steps.push(stepRecord);
    writeSession(sessionName, session);

    const guidance: string[] = [
      `✅ Step ${stepIndex} recorded: "${label}"`,
      `Session: ${sessionName} (${session.steps.length} steps total)`,
      screenshotOk
        ? `Screenshot saved: ${screenshotRelPath}`
        : `⚠️ Screenshot capture failed — check simulator is booted`,
      `Accessibility elements: ${elementCount}${accessibilityNote ? ` (${accessibilityNote})` : ''}`,
      `Next: record more steps with test-record-step, then generate report with test-record-report`,
    ];

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              sessionName,
              stepIndex,
              label,
              screenshot: screenshotRelPath,
              accessibilityFile: accessibilityRelPath,
              elementCount,
              timestampMs,
              assertion,
              metadata,
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
      `test-record-step failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// === DOCUMENTATION ===

export const TEST_RECORD_STEP_DOCS = `
# test-record-step

Record a single named step in a test session, capturing a screenshot and accessibility tree snapshot.

## What it does

Maintains a persistent session directory under \`~/.xc-mcp/test-recordings/<sessionName>/\`
(override root with env var \`XC_MCP_RECORDINGS_DIR\`). Each call:
1. Creates the session directory + steps.json on first call
2. Captures a screenshot via \`xcrun simctl io <udid|booted> screenshot\`
3. Captures an accessibility tree via \`idb ui describe-all\` (tolerates idb absence)
4. Appends a step record to steps.json with sequential index (001, 002, …)

Session layout:
\`\`\`
~/.xc-mcp/test-recordings/<sessionName>/
  steps.json          – session metadata + all step records
  screenshots/        – NNN-<label>.png per step
  accessibility/      – NNN-<label>.json per step (idb NDJSON or error stub)
  report.md           – generated by test-record-report
\`\`\`

## Parameters

- **sessionName** (string, required): Unique session identifier (used as directory name)
- **label** (string, required): Human-readable description of this step
- **udid** (string, optional): Simulator UDID — defaults to \`booted\`
- **metadata** (object, optional): Arbitrary key-value pairs attached to step record
- **assertion** (string, optional): Assertion description recorded with step

## Returns

JSON with \`{ sessionName, stepIndex, label, screenshot, accessibilityFile, elementCount, timestampMs }\`
plus guidance for next steps.

## Examples

### Record first step
\`\`\`typescript
await testRecordStepTool({ sessionName: "login-flow", label: "App launched" })
\`\`\`

### Step with assertion and metadata
\`\`\`typescript
await testRecordStepTool({
  sessionName: "login-flow",
  label: "Login succeeded",
  assertion: "Home screen is visible",
  metadata: { user: "test@example.com", env: "staging" }
})
\`\`\`

### Specific simulator
\`\`\`typescript
await testRecordStepTool({
  sessionName: "login-flow",
  label: "Credentials entered",
  udid: "device-123"
})
\`\`\`
`;

export const TEST_RECORD_STEP_DOCS_MINI =
  'Record a test step with screenshot + accessibility snapshot into a named session. Use rtfm({ toolName: "test-record-step" }) for docs.';
