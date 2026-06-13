import * as path from 'path';
import { localizationAuditTool } from '../../../src/tools/analysis/localization-audit.js';

const FIXTURE = path.resolve(process.cwd(), 'tests/fixtures/localization/Localizable.xcstrings');

describe('localization-audit', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleErrorSpy.mockRestore());

  it('parses the catalog and reports key/locale counts', async () => {
    const result = await localizationAuditTool({ catalogPath: FIXTURE });
    const sc = result.structuredContent as any;
    expect(sc.totalKeys).toBe(4);
    expect(sc.localeCount).toBe(2); // en + de
    expect(result.isError).toBe(false);
  });

  it('detects a missing-locale gap and a needs_review gap', async () => {
    const result = await localizationAuditTool({ catalogPath: FIXTURE });
    const data = JSON.parse((result.content[0] as any).text);
    const gapReasons = data.gaps.map((g: any) => `${g.key}:${g.reason}`);
    expect(gapReasons).toContain('missing.in.german:missing');
    expect(gapReasons.some((g: string) => g.startsWith('needs.review.key:'))).toBe(true);
  });

  it('detects a placeholder-count mismatch', async () => {
    const result = await localizationAuditTool({ catalogPath: FIXTURE });
    const data = JSON.parse((result.content[0] as any).text);
    const keys = data.placeholderMismatches.map((m: any) => m.key);
    expect(keys).toContain('placeholder.mismatch');
  });

  it('strict mode sets isError when findings exist', async () => {
    const result = await localizationAuditTool({ catalogPath: FIXTURE, strict: true });
    expect(result.isError).toBe(true);
  });

  it('throws InvalidRequest for a missing catalog file', async () => {
    await expect(
      localizationAuditTool({ catalogPath: '/no/such/file.xcstrings' })
    ).rejects.toThrow();
  });
});
