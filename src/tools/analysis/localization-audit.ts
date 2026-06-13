import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import * as fs from 'fs';
import * as path from 'path';

// === TYPES ===

interface LocaleGap {
  key: string;
  locale: string;
  reason: string; // "missing" | "needs_review" | "new" | "stale"
}

interface PlaceholderMismatch {
  key: string;
  sourceLocale: string;
  sourcePlaceholders: string[];
  offendingLocale: string;
  offendingPlaceholders: string[];
}

interface LocaleEntry {
  state: string;
  value: string;
}

type StringsMap = Record<string, Record<string, LocaleEntry>>;

interface AuditResult {
  catalogPath: string;
  sourceLanguage: string;
  totalKeys: number;
  locales: string[];
  gaps: LocaleGap[];
  missingFromCatalog: string[];
  unusedInSource: string[];
  placeholderMismatches: PlaceholderMismatch[];
}

interface LocalizationAuditArgs {
  catalogPath: string;
  sourceDir?: string;
  strict?: boolean;
  verbose?: boolean;
}

// === PLACEHOLDER EXTRACTION ===

// Matches %d, %@, %s, %lld, %ld, %f and positional %1$@, %2$d etc.
const PLACEHOLDER_RE =
  /%(?:\d+\$)?(?:[-+0 #]*)?(?:\d+)?(?:\.\d+)?(?:hh|h|ll|l|z|t|q)?[diouxXeEfgGcsSpaAqQzZtb@]/g;

// Swift source patterns for localized string keys
const SWIFT_LOCALIZED_RE =
  /String\s*\(\s*localized\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"|NSLocalizedString\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;

function extractPlaceholders(value: string): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  while ((match = re.exec(value)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

// === XCSTRINGS PARSER ===

function parseXcstrings(filePath: string): { sourceLanguage: string; strings: StringsMap } {
  let raw: Record<string, unknown>;
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    raw = JSON.parse(text);
  } catch (err) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Failed to parse .xcstrings JSON at ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const sourceLanguage = (raw['sourceLanguage'] as string) || 'en';
  const rawStrings = (raw['strings'] as Record<string, unknown>) || {};
  const strings: StringsMap = {};

  for (const [key, entry] of Object.entries(rawStrings)) {
    const entryObj = entry as Record<string, unknown>;
    const localizations = (entryObj['localizations'] as Record<string, unknown>) || {};
    strings[key] = {};

    for (const [locale, locData] of Object.entries(localizations)) {
      const locObj = locData as Record<string, unknown>;

      if ('stringUnit' in locObj) {
        const unit = locObj['stringUnit'] as Record<string, string>;
        strings[key][locale] = {
          state: unit['state'] || '',
          value: unit['value'] || '',
        };
      } else if ('variations' in locObj) {
        // Plural variations — grab first available variant for placeholder check
        const variations = locObj['variations'] as Record<string, unknown>;
        const plural = (variations['plural'] as Record<string, unknown>) || {};
        const firstVariant = (Object.values(plural)[0] as Record<string, unknown>) || {};
        const unit = (firstVariant['stringUnit'] as Record<string, string>) || {};
        strings[key][locale] = {
          state: unit['state'] || '',
          value: unit['value'] || '',
        };
      }
    }
  }

  return { sourceLanguage, strings };
}

// === LEGACY .strings / .stringsdict PARSER ===

async function parseLegacyStringsFile(
  filePath: string
): Promise<{ sourceLanguage: string; strings: StringsMap }> {
  // Infer locale from parent directory (e.g. en.lproj/Localizable.strings → "en")
  const parent = path.basename(path.dirname(filePath));
  const locale = parent.endsWith('.lproj') ? parent.slice(0, -6) : 'unknown';
  const sourceLanguage = locale;
  const strings: StringsMap = {};

  // Try plutil to convert to JSON (handles binary and XML plists)
  try {
    const result = await executeCommand(`plutil -convert json -o - "${filePath}"`, {
      timeout: 10000,
    });
    if (result.code === 0 && result.stdout) {
      const data = JSON.parse(result.stdout) as Record<string, unknown>;

      if (filePath.endsWith('.stringsdict')) {
        for (const [key, pluralDict] of Object.entries(data)) {
          const pd = pluralDict as Record<string, unknown>;
          const value = (pd['NSStringLocalizedFormatKey'] as string) || '';
          strings[key] = { [locale]: { state: 'translated', value } };
        }
      } else {
        for (const [key, value] of Object.entries(data)) {
          strings[key] = { [locale]: { state: 'translated', value: String(value) } };
        }
      }
      return { sourceLanguage, strings };
    }
  } catch {
    // fall through to text regex fallback
  }

  // Fallback: text-format .strings ("key" = "value";) via regex
  const kvRe = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    try {
      text = fs.readFileSync(filePath, 'latin1');
    } catch {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to read .strings file ${filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  let match: RegExpExecArray | null;
  while ((match = kvRe.exec(text)) !== null) {
    strings[match[1]] = { [locale]: { state: 'translated', value: match[2] } };
  }
  return { sourceLanguage, strings };
}

// === SWIFT SOURCE SCANNER ===

function scanSwiftSources(sourceDir: string): Set<string> {
  const keys = new Set<string>();

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.swift')) {
        let content: string;
        try {
          content = fs.readFileSync(fullPath, 'utf-8');
        } catch {
          continue;
        }
        const re = new RegExp(SWIFT_LOCALIZED_RE.source, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const key = m[1] || m[2];
          if (key) keys.add(key);
        }
      }
    }
  }

  walk(sourceDir);
  return keys;
}

// === CORE AUDIT LOGIC ===

function collectGaps(
  strings: StringsMap,
  allLocales: Set<string>,
  sourceLanguage: string
): LocaleGap[] {
  const gaps: LocaleGap[] = [];
  const nonSourceLocales = new Set([...allLocales].filter(l => l !== sourceLanguage));

  for (const [key, localeMap] of Object.entries(strings)) {
    for (const locale of nonSourceLocales) {
      if (!(locale in localeMap)) {
        gaps.push({ key, locale, reason: 'missing' });
      } else {
        const state = localeMap[locale].state;
        if (['needs_review', 'new', 'stale'].includes(state)) {
          gaps.push({ key, locale, reason: state });
        }
      }
    }
  }

  return gaps.sort((a, b) => a.locale.localeCompare(b.locale) || a.key.localeCompare(b.key));
}

function checkPlaceholderMismatches(
  strings: StringsMap,
  sourceLanguage: string
): PlaceholderMismatch[] {
  const mismatches: PlaceholderMismatch[] = [];

  for (const [key, localeMap] of Object.entries(strings)) {
    const sourceEntry = localeMap[sourceLanguage];
    if (!sourceEntry) continue;

    const sourcePlaceholders = extractPlaceholders(sourceEntry.value);

    for (const [locale, entry] of Object.entries(localeMap)) {
      if (locale === sourceLanguage) continue;
      if (!entry.value) continue; // gaps reported separately

      const localePlaceholders = extractPlaceholders(entry.value);
      if (localePlaceholders.length !== sourcePlaceholders.length) {
        mismatches.push({
          key,
          sourceLocale: sourceLanguage,
          sourcePlaceholders,
          offendingLocale: locale,
          offendingPlaceholders: localePlaceholders,
        });
      }
    }
  }

  return mismatches.sort(
    (a, b) => a.offendingLocale.localeCompare(b.offendingLocale) || a.key.localeCompare(b.key)
  );
}

// === OUTPUT FORMATTERS ===

function formatSummary(result: AuditResult, verbose: boolean): string {
  const gapByLocale: Record<string, number> = {};
  for (const gap of result.gaps) {
    gapByLocale[gap.locale] = (gapByLocale[gap.locale] || 0) + 1;
  }
  const gapSummary =
    Object.entries(gapByLocale)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([locale, count]) => `${count} in ${locale}`)
      .join(', ') || 'none';

  const lines = [
    `Catalog: ${result.totalKeys} keys, ${result.locales.length} locales, ${result.gaps.length} gaps.`,
    `Missing/needs-review: ${gapSummary}.`,
  ];

  if (result.missingFromCatalog.length > 0)
    lines.push(`Missing from catalog: ${result.missingFromCatalog.length} keys.`);
  if (result.unusedInSource.length > 0)
    lines.push(`Unused in source: ${result.unusedInSource.length} keys.`);
  if (result.placeholderMismatches.length > 0)
    lines.push(`Placeholder mismatches: ${result.placeholderMismatches.length}.`);

  const hasFindings =
    result.gaps.length > 0 ||
    result.missingFromCatalog.length > 0 ||
    result.unusedInSource.length > 0 ||
    result.placeholderMismatches.length > 0;

  if (!hasFindings) lines.push('No issues found.');

  if (!verbose) return lines.join('\n');

  // Verbose: add detailed sections
  const sections = [...lines, ''];

  if (result.gaps.length > 0) {
    sections.push('=== Translation Gaps ===');
    let currentLocale = '';
    for (const gap of result.gaps) {
      if (gap.locale !== currentLocale) {
        sections.push(`\n[${gap.locale}]`);
        currentLocale = gap.locale;
      }
      sections.push(`  ${gap.reason.padEnd(15)}  ${gap.key}`);
    }
  }

  if (result.missingFromCatalog.length > 0) {
    sections.push('\n=== Keys in Source, Missing from Catalog ===');
    for (const key of result.missingFromCatalog) sections.push(`  ${key}`);
  }

  if (result.unusedInSource.length > 0) {
    sections.push('\n=== Keys in Catalog, Unused in Source ===');
    for (const key of result.unusedInSource) sections.push(`  ${key}`);
  }

  if (result.placeholderMismatches.length > 0) {
    sections.push('\n=== Placeholder Mismatches ===');
    for (const m of result.placeholderMismatches) {
      sections.push(
        `  [${m.offendingLocale}] ${m.key}\n` +
          `    ${m.sourceLocale}: [${m.sourcePlaceholders.join(', ')}]\n` +
          `    ${m.offendingLocale}: [${m.offendingPlaceholders.join(', ')}]`
      );
    }
  }

  return sections.join('\n');
}

// === MAIN TOOL EXPORT ===

/**
 * Audit an .xcstrings / .strings / .stringsdict catalog for localization gaps
 *
 * Examples:
 * - Audit xcstrings: catalogPath: "/path/to/Localizable.xcstrings"
 * - With source scan: catalogPath: "...", sourceDir: "./MyApp"
 * - Strict mode (error on findings): catalogPath: "...", strict: true
 * - Verbose output: catalogPath: "...", verbose: true
 *
 * Supports:
 * - .xcstrings (Xcode 15+ JSON catalog)
 * - .strings (legacy plist or text format)
 * - .stringsdict (pluralization plist)
 *
 * **Full documentation:** See analysis/localization-audit.md for detailed parameters and examples
 */
export async function localizationAuditTool(args: any) {
  const { catalogPath, sourceDir, strict = false, verbose = false } = args as LocalizationAuditArgs;

  try {
    // Validate catalogPath
    if (!catalogPath || catalogPath.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'catalogPath is required and cannot be empty');
    }

    if (!fs.existsSync(catalogPath)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Catalog not found: ${catalogPath}. Provide a valid path to an .xcstrings, .strings, or .stringsdict file.`
      );
    }

    // Parse catalog
    const ext = path.extname(catalogPath).toLowerCase();
    let sourceLanguage: string;
    let strings: StringsMap;

    if (ext === '.xcstrings') {
      ({ sourceLanguage, strings } = parseXcstrings(catalogPath));
    } else if (ext === '.strings' || ext === '.stringsdict') {
      ({ sourceLanguage, strings } = await parseLegacyStringsFile(catalogPath));
    } else {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unsupported catalog format "${ext}". Expected .xcstrings, .strings, or .stringsdict.`
      );
    }

    // Collect all locales seen across all keys
    const allLocales = new Set<string>();
    for (const localeMap of Object.values(strings)) {
      for (const locale of Object.keys(localeMap)) {
        allLocales.add(locale);
      }
    }

    const result: AuditResult = {
      catalogPath,
      sourceLanguage,
      totalKeys: Object.keys(strings).length,
      locales: [...allLocales].sort(),
      gaps: collectGaps(strings, allLocales, sourceLanguage),
      missingFromCatalog: [],
      unusedInSource: [],
      placeholderMismatches: checkPlaceholderMismatches(strings, sourceLanguage),
    };

    // Optional source scan
    if (sourceDir) {
      if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `sourceDir not found or not a directory: ${sourceDir}`
        );
      }
      const sourceKeys = scanSwiftSources(sourceDir);
      const catalogKeys = new Set(Object.keys(strings));
      result.missingFromCatalog = [...sourceKeys].filter(k => !catalogKeys.has(k)).sort();
      result.unusedInSource = [...catalogKeys].filter(k => !sourceKeys.has(k)).sort();
    }

    const hasFindings =
      result.gaps.length > 0 ||
      result.missingFromCatalog.length > 0 ||
      result.unusedInSource.length > 0 ||
      result.placeholderMismatches.length > 0;

    const summaryText = formatSummary(result, verbose);

    const responseData = {
      ...result,
      summary: summaryText,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(responseData, null, 2),
        },
      ],
      structuredContent: {
        totalKeys: result.totalKeys,
        localeCount: result.locales.length,
        gapCount: result.gaps.length,
        placeholderMismatchCount: result.placeholderMismatches.length,
      },
      isError: strict && hasFindings,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `localization-audit failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// === DOCUMENTATION ===

export const LOCALIZATION_AUDIT_DOCS = `
# localization-audit

Audit .xcstrings, .strings, or .stringsdict catalogs for localization gaps, placeholder mismatches,
and unused or missing keys relative to Swift source code.

## What it does

Pure file analysis — no simulator required. Parses localization catalogs and reports:
- Per-locale missing/untranslated keys
- Keys with needs_review, new, or stale states
- Format-specifier placeholder count mismatches across locales
- Keys in Swift source but absent from catalog (missing_from_catalog)
- Keys in catalog but absent from Swift source (unused_in_source)

## Parameters

- **catalogPath** (string, required): Path to .xcstrings, .strings, or .stringsdict catalog file
- **sourceDir** (string, optional): Swift source root for unused/missing key cross-reference
- **strict** (boolean, optional): Set isError:true in response if any findings are present
- **verbose** (boolean, optional): Include detailed per-key breakdown in summary text

## Supported Catalog Formats

- **.xcstrings**: Xcode 15+ JSON catalog with multi-locale support
- **.strings**: Legacy single-locale plist (binary/XML/text format)
- **.stringsdict**: Pluralization rules plist

## Returns

JSON response with:
- \`catalogPath\`, \`sourceLanguage\`, \`totalKeys\`, \`locales\`
- \`gaps\`: array of { key, locale, reason } objects
- \`missingFromCatalog\`: keys in Swift source not in catalog
- \`unusedInSource\`: keys in catalog not referenced in Swift source
- \`placeholderMismatches\`: keys where placeholder counts differ across locales
- \`summary\`: compact human-readable summary text

structuredContent: \`{ totalKeys, localeCount, gapCount, placeholderMismatchCount }\`

## Examples

### Audit .xcstrings catalog
\`\`\`typescript
await localizationAuditTool({
  catalogPath: '/path/to/Localizable.xcstrings'
})
\`\`\`

### Full audit with source cross-reference
\`\`\`typescript
await localizationAuditTool({
  catalogPath: '/path/to/Localizable.xcstrings',
  sourceDir: './MyApp',
  verbose: true
})
\`\`\`

### Strict mode (error on any findings)
\`\`\`typescript
await localizationAuditTool({
  catalogPath: '/path/to/Localizable.xcstrings',
  strict: true
})
\`\`\`

## Gap Reasons

- **missing**: Key has no translation for that locale
- **needs_review**: Translation exists but marked for review
- **new**: Translation is new and unverified
- **stale**: Translation is outdated relative to source

## Placeholder Matching

Extracts printf-style format specifiers (%@, %d, %s, %lld, positional %1$@, etc.)
and reports keys where the count differs between source and a target locale.
Empty-value locales are skipped (gaps reported separately).
`;

export const LOCALIZATION_AUDIT_DOCS_MINI =
  'Audit .xcstrings/.strings/.stringsdict for gaps, placeholder mismatches, and unused keys. Use rtfm({ toolName: "localization-audit" }) for docs.';
