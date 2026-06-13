import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as path from 'path';

// === TYPES ===

interface VisualDiffArgs {
  baselinePath: string;
  currentPath: string;
  outputDir?: string;
  threshold?: number;
}

interface DiffReport {
  baseline: string;
  current: string;
  dimensions: { width: number; height: number };
  totalPixels: number;
  differentPixels: number;
  differencePercentage: number;
  thresholdPercentage: number;
  passed: boolean;
}

// === MAIN TOOL EXPORT ===

/**
 * Compare two PNG screenshots pixel-by-pixel and write a diff image + JSON report.
 *
 * Examples:
 * - Basic diff: baselinePath: "/tmp/before.png", currentPath: "/tmp/after.png"
 * - Custom output dir: baselinePath: "...", currentPath: "...", outputDir: "/tmp/diffs"
 * - Strict threshold: baselinePath: "...", currentPath: "...", threshold: 0.001
 *
 * **Full documentation:** See io/visual-diff.md for detailed parameters and examples
 */
export async function visualDiffTool(args: any) {
  const {
    baselinePath,
    currentPath,
    outputDir: outputDirArg,
    threshold = 0.01,
  } = args as VisualDiffArgs;

  try {
    // Validate required paths
    if (!baselinePath || baselinePath.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'baselinePath is required and cannot be empty');
    }
    if (!currentPath || currentPath.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'currentPath is required and cannot be empty');
    }

    if (!fs.existsSync(baselinePath)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Baseline image not found: ${baselinePath}. Provide a valid path to an existing PNG file.`
      );
    }
    if (!fs.existsSync(currentPath)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Current image not found: ${currentPath}. Provide a valid path to an existing PNG file.`
      );
    }

    // Resolve output directory
    const outputDir = outputDirArg ?? path.dirname(currentPath);
    fs.mkdirSync(outputDir, { recursive: true });

    // Read PNGs
    let baseline: PNG;
    let current: PNG;
    try {
      baseline = PNG.sync.read(fs.readFileSync(baselinePath));
    } catch (err) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to read baseline PNG at ${baselinePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    try {
      current = PNG.sync.read(fs.readFileSync(currentPath));
    } catch (err) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to read current PNG at ${currentPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Validate dimensions match
    if (baseline.width !== current.width || baseline.height !== current.height) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Image dimensions do not match. ` +
          `Baseline: ${baseline.width}x${baseline.height}, ` +
          `Current: ${current.width}x${current.height}. ` +
          `Both images must have identical dimensions to perform a diff.`
      );
    }

    const { width, height } = baseline;
    const totalPixels = width * height;

    // Run pixelmatch (dynamic import for ESM/Jest compatibility)
    const pixelmatch = (await import('pixelmatch')).default;
    const diffBuffer = Buffer.alloc(width * height * 4);
    const differentPixels = pixelmatch(baseline.data, current.data, diffBuffer, width, height, {
      threshold: 0.1,
    });

    const differencePercentage = differentPixels / totalPixels;
    const passed = differencePercentage <= threshold;

    // Write diff PNG
    const diff = new PNG({ width, height });
    diff.data = diffBuffer;
    fs.writeFileSync(path.join(outputDir, 'diff.png'), PNG.sync.write(diff));

    // Write JSON report
    const report: DiffReport = {
      baseline: baselinePath,
      current: currentPath,
      dimensions: { width, height },
      totalPixels,
      differentPixels,
      differencePercentage,
      thresholdPercentage: threshold,
      passed,
    };
    fs.writeFileSync(path.join(outputDir, 'diff-report.json'), JSON.stringify(report, null, 2));

    // Build summary text
    const diffPct = (differencePercentage * 100).toFixed(4);
    const verdict = passed ? 'PASS' : 'FAIL';
    const summaryLines = [
      `Visual diff: ${verdict}`,
      `Dimensions: ${width}x${height} (${totalPixels.toLocaleString()} pixels)`,
      `Different pixels: ${differentPixels.toLocaleString()} (${diffPct}%)`,
      `Threshold: ${(threshold * 100).toFixed(2)}%`,
      `Artifacts written to: ${outputDir}/`,
    ];

    return {
      content: [
        {
          type: 'text' as const,
          text: summaryLines.join('\n'),
        },
      ],
      structuredContent: {
        differentPixels,
        differencePercentage,
        passed,
      },
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `visual-diff failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// === DOCUMENTATION ===

export const VISUAL_DIFF_DOCS = `
# visual-diff

Compare two PNG screenshots pixel-by-pixel using pixelmatch to detect visual regressions.
Writes a highlighted diff image and a JSON report to the output directory.

## What it does

Reads two PNG files, compares them pixel-by-pixel, and:
- Reports the number and percentage of differing pixels
- Determines pass/fail against a configurable threshold
- Writes \`diff.png\` with highlighted differences (red pixels where images differ)
- Writes \`diff-report.json\` with full metrics

## Parameters

- **baselinePath** (string, required): Path to the baseline (reference) PNG
- **currentPath** (string, required): Path to the current (test) PNG
- **outputDir** (string, optional): Directory for diff.png and diff-report.json. Defaults to the directory containing currentPath
- **threshold** (number, optional): Maximum acceptable ratio of different pixels (0.01 = 1%). Default: 0.01

## Returns

Text summary and structuredContent:
- \`differentPixels\`: Count of pixels that differ
- \`differencePercentage\`: Ratio of different pixels to total pixels (0–1)
- \`passed\`: true if differencePercentage <= threshold

## Artifacts Written

- \`diff.png\`: Diff image highlighting changed pixels (pixelmatch output)
- \`diff-report.json\`: JSON with baseline, current, dimensions, totalPixels, differentPixels, differencePercentage, thresholdPercentage, passed

## Errors

Throws McpError(InvalidRequest) for:
- Missing baseline or current file
- Dimension mismatch between images
- PNG read failures

## Examples

### Basic diff
\`\`\`typescript
await visualDiffTool({
  baselinePath: '/tmp/before.png',
  currentPath: '/tmp/after.png'
})
\`\`\`

### Custom output directory and strict threshold
\`\`\`typescript
await visualDiffTool({
  baselinePath: '/tmp/before.png',
  currentPath: '/tmp/after.png',
  outputDir: '/tmp/diffs',
  threshold: 0.001
})
\`\`\`

### Zero-tolerance regression check
\`\`\`typescript
await visualDiffTool({
  baselinePath: '/snapshots/login-baseline.png',
  currentPath: '/snapshots/login-current.png',
  threshold: 0
})
\`\`\`
`;

export const VISUAL_DIFF_DOCS_MINI =
  'Compare two PNG screenshots pixel-by-pixel for visual regressions. Use rtfm({ toolName: "visual-diff" }) for docs.';
