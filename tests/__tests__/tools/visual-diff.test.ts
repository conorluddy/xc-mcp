import { visualDiffTool } from '../../../src/tools/io/visual-diff.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// === FIXTURE HELPERS ===

function createSolidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    png.data[offset] = r;
    png.data[offset + 1] = g;
    png.data[offset + 2] = b;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

function createPngWithPatch(
  width: number,
  height: number,
  baseR: number,
  baseG: number,
  baseB: number,
  patchPixels: number // how many pixels from start to recolor (red)
): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    if (i < patchPixels) {
      png.data[offset] = 255;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = 0;
    } else {
      png.data[offset] = baseR;
      png.data[offset + 1] = baseG;
      png.data[offset + 2] = baseB;
    }
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

// === TEST SETUP ===

let tmpDir: string;

beforeAll(() => {
  tmpDir = path.join(os.tmpdir(), `visual-diff-test-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

// === TESTS ===

describe('visualDiffTool', () => {
  it('a) returns passed:true and differentPixels:0 for two identical 8x8 PNGs', async () => {
    const baselinePath = path.join(tmpDir, 'baseline-identical.png');
    const currentPath = path.join(tmpDir, 'current-identical.png');
    const outputDir = path.join(tmpDir, 'out-identical');

    const pngBuf = createSolidPng(8, 8, 100, 150, 200);
    fs.writeFileSync(baselinePath, pngBuf);
    fs.writeFileSync(currentPath, pngBuf);

    const result = await visualDiffTool({ baselinePath, currentPath, outputDir });

    expect(result.isError).toBe(false);
    expect(result.structuredContent.differentPixels).toBe(0);
    expect(result.structuredContent.differencePercentage).toBe(0);
    expect(result.structuredContent.passed).toBe(true);

    // Artifacts exist
    expect(fs.existsSync(path.join(outputDir, 'diff.png'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'diff-report.json'))).toBe(true);

    const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'diff-report.json'), 'utf-8'));
    expect(report.differentPixels).toBe(0);
    expect(report.passed).toBe(true);
    expect(report.dimensions).toEqual({ width: 8, height: 8 });
    expect(report.totalPixels).toBe(64);
  });

  it('b) detects differing pixels and computes differencePercentage correctly', async () => {
    const baselinePath = path.join(tmpDir, 'baseline-diff.png');
    const currentPath = path.join(tmpDir, 'current-diff.png');
    const outputDir = path.join(tmpDir, 'out-diff');

    // 8x8 = 64 pixels; patch 8 pixels (12.5%)
    const patchPixels = 8;
    const baselineBuf = createSolidPng(8, 8, 0, 255, 0);
    const currentBuf = createPngWithPatch(8, 8, 0, 255, 0, patchPixels);
    fs.writeFileSync(baselinePath, baselineBuf);
    fs.writeFileSync(currentPath, currentBuf);

    // Use a low threshold so it fails (patched pixels > 1%)
    const result = await visualDiffTool({
      baselinePath,
      currentPath,
      outputDir,
      threshold: 0.01,
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent.differentPixels).toBeGreaterThan(0);

    const expectedPercentage = result.structuredContent.differentPixels / 64;
    expect(result.structuredContent.differencePercentage).toBeCloseTo(expectedPercentage, 10);

    // With 8 changed pixels out of 64, that's 12.5% — above 1% threshold
    expect(result.structuredContent.passed).toBe(false);

    // Now use a permissive threshold that allows it
    const outputDir2 = path.join(tmpDir, 'out-diff-pass');
    const result2 = await visualDiffTool({
      baselinePath,
      currentPath,
      outputDir: outputDir2,
      threshold: 0.5, // 50% — definitely passes
    });
    expect(result2.structuredContent.passed).toBe(true);
    expect(result2.structuredContent.differentPixels).toBe(
      result.structuredContent.differentPixels
    );
  });

  it('c) throws McpError with dimension info when images are different sizes', async () => {
    const baselinePath = path.join(tmpDir, 'baseline-size.png');
    const currentPath = path.join(tmpDir, 'current-size.png');

    fs.writeFileSync(baselinePath, createSolidPng(8, 8, 0, 0, 255));
    fs.writeFileSync(currentPath, createSolidPng(16, 16, 0, 0, 255));

    await expect(
      visualDiffTool({ baselinePath, currentPath, outputDir: path.join(tmpDir, 'out-size') })
    ).rejects.toBeInstanceOf(McpError);

    await expect(
      visualDiffTool({ baselinePath, currentPath, outputDir: path.join(tmpDir, 'out-size2') })
    ).rejects.toMatchObject({
      message: expect.stringContaining('8x8'),
    });
  });

  it('throws McpError when baseline file does not exist', async () => {
    await expect(
      visualDiffTool({
        baselinePath: '/nonexistent/baseline.png',
        currentPath: '/nonexistent/current.png',
        outputDir: tmpDir,
      })
    ).rejects.toBeInstanceOf(McpError);
  });

  it('throws McpError when current file does not exist', async () => {
    const baselinePath = path.join(tmpDir, 'baseline-exists.png');
    fs.writeFileSync(baselinePath, createSolidPng(8, 8, 255, 255, 0));

    await expect(
      visualDiffTool({
        baselinePath,
        currentPath: '/nonexistent/current.png',
        outputDir: tmpDir,
      })
    ).rejects.toBeInstanceOf(McpError);
  });
});
