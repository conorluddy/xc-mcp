import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

// === CONSTANTS ===

const TEXT_SIZE_MAP: Record<string, string> = {
  XS: 'extra-small',
  S: 'small',
  M: 'medium',
  L: 'large',
  XL: 'extra-large',
  XXL: 'extra-extra-large',
  XXXL: 'extra-extra-extra-large',
  AX1: 'accessibility-medium',
  AX2: 'accessibility-large',
  AX3: 'accessibility-extra-large',
  AX4: 'accessibility-extra-extra-large',
  AX5: 'accessibility-extra-extra-extra-large',
};

const RTL_LOCALE_PREFIXES = ['ar', 'he', 'fa', 'ur', 'yi'];

const DEFAULT_THEME = 'light';
const DEFAULT_TEXT_SIZE = 'M';
const DEFAULT_LOCALE = 'en';
const DEFAULT_REGION = 'US';

// === TYPES ===

interface AppearanceArgs {
  udid?: string;
  theme?: 'light' | 'dark';
  textSize?: string;
  locale?: string;
  region?: string;
  bundleId?: string;
  reset?: boolean;
}

interface OperationResult {
  success: boolean;
  message: string;
}

// === HELPERS ===

async function resolveUdid(udid?: string): Promise<string> {
  if (udid && udid.trim().length > 0) {
    const sim = await simulatorCache.findSimulatorByUdid(udid.trim());
    if (!sim) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${udid}" not found. Use simctl-list to see available simulators.`
      );
    }
    return udid.trim();
  }

  // Auto-detect booted simulator
  const available = await simulatorCache.getAvailableSimulators();
  const booted = available.find(s => s.state === 'Booted');
  if (!booted) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'No booted simulator found. Boot a simulator first or provide a udid.'
    );
  }
  return booted.udid;
}

async function setTheme(udid: string, theme: string): Promise<OperationResult> {
  const command = `xcrun simctl ui "${udid}" appearance ${theme}`;
  console.error(`[simctl-appearance] Executing: ${command}`);
  const result = await executeCommand(command, { timeout: 15000 });
  if (result.code === 0) {
    return { success: true, message: `Theme set: ${theme}` };
  }
  return { success: false, message: result.stderr || 'Failed to set theme' };
}

async function setTextSize(udid: string, alias: string): Promise<OperationResult> {
  const token = TEXT_SIZE_MAP[alias.toUpperCase()];
  if (!token) {
    const valid = Object.keys(TEXT_SIZE_MAP).join(', ');
    return { success: false, message: `Unknown text size '${alias}'. Valid: ${valid}` };
  }
  const command = `xcrun simctl ui "${udid}" content_size ${token}`;
  console.error(`[simctl-appearance] Executing: ${command}`);
  const result = await executeCommand(command, { timeout: 15000 });
  if (result.code === 0) {
    return { success: true, message: `Text size set: ${alias} (${token})` };
  }
  return { success: false, message: result.stderr || 'Failed to set text size' };
}

async function setLocale(
  udid: string,
  locale: string,
  region?: string,
  bundleId?: string
): Promise<OperationResult> {
  const appleLocale = region ? `${locale}_${region}` : locale;

  const langCommand = `xcrun simctl spawn "${udid}" defaults write -g AppleLanguages -array ${locale}`;
  console.error(`[simctl-appearance] Executing: ${langCommand}`);
  const langResult = await executeCommand(langCommand, { timeout: 15000 });
  if (langResult.code !== 0) {
    return {
      success: false,
      message: `Failed to write AppleLanguages: ${langResult.stderr || 'unknown error'}`,
    };
  }

  const localeCommand = `xcrun simctl spawn "${udid}" defaults write -g AppleLocale -string ${appleLocale}`;
  console.error(`[simctl-appearance] Executing: ${localeCommand}`);
  const localeResult = await executeCommand(localeCommand, { timeout: 15000 });
  if (localeResult.code !== 0) {
    return {
      success: false,
      message: `Failed to write AppleLocale: ${localeResult.stderr || 'unknown error'}`,
    };
  }

  const isRtl = RTL_LOCALE_PREFIXES.some(prefix => locale.startsWith(prefix));
  const rtlNote = isRtl ? ' [RTL layout]' : '';
  let summary = `Locale set: ${appleLocale}${rtlNote}`;

  if (bundleId) {
    // Terminate (ignore failure) then launch
    const terminateCommand = `xcrun simctl terminate "${udid}" ${bundleId}`;
    console.error(`[simctl-appearance] Executing: ${terminateCommand}`);
    await executeCommand(terminateCommand, { timeout: 10000 });

    const launchCommand = `xcrun simctl launch "${udid}" ${bundleId}`;
    console.error(`[simctl-appearance] Executing: ${launchCommand}`);
    const launchResult = await executeCommand(launchCommand, { timeout: 15000 });
    if (launchResult.code === 0) {
      summary += ` — app restarted: ${bundleId}`;
    } else {
      summary += ` — locale written but app restart failed: ${launchResult.stderr || 'unknown error'}`;
    }
  } else {
    summary += ' — restart app to apply';
  }

  return { success: true, message: summary };
}

async function resetAppearance(udid: string): Promise<OperationResult> {
  const results: string[] = [];
  const errors: string[] = [];

  const themeResult = await setTheme(udid, DEFAULT_THEME);
  (themeResult.success ? results : errors).push(themeResult.message);

  const sizeResult = await setTextSize(udid, DEFAULT_TEXT_SIZE);
  (sizeResult.success ? results : errors).push(sizeResult.message);

  const localeResult = await setLocale(udid, DEFAULT_LOCALE, DEFAULT_REGION);
  (localeResult.success ? results : errors).push(localeResult.message);

  if (errors.length > 0) {
    return { success: false, message: `Reset partial — errors: ${errors.join('; ')}` };
  }

  return { success: true, message: 'Appearance reset to defaults (light / M / en_US)' };
}

// === TOOL IMPLEMENTATION ===

export async function simctlAppearanceTool(args: any) {
  const { udid, theme, textSize, locale, region, bundleId, reset } = args as AppearanceArgs;

  try {
    // Validate: require at least one action
    if (!theme && !textSize && !locale && !reset) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'At least one of theme, textSize, locale, or reset is required.'
      );
    }

    // Validate: reset incompatible with other flags
    if (reset && (theme || textSize || locale)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'reset cannot be combined with theme, textSize, or locale.'
      );
    }

    // Validate: region requires locale
    if (region && !locale) {
      throw new McpError(ErrorCode.InvalidRequest, 'region requires locale.');
    }

    // Validate: bundleId requires locale
    if (bundleId && !locale) {
      throw new McpError(ErrorCode.InvalidRequest, 'bundleId requires locale.');
    }

    // Validate textSize alias early (before running anything)
    if (textSize && !TEXT_SIZE_MAP[textSize.toUpperCase()]) {
      const valid = Object.keys(TEXT_SIZE_MAP).join(', ');
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown text size '${textSize}'. Valid aliases: ${valid}`
      );
    }

    const resolvedUdid = await resolveUdid(udid);

    const operationResults: Record<string, OperationResult> = {};
    const guidance: string[] = [];

    if (reset) {
      operationResults.reset = await resetAppearance(resolvedUdid);
    } else {
      if (theme) {
        operationResults.theme = await setTheme(resolvedUdid, theme);
      }
      if (textSize) {
        operationResults.textSize = await setTextSize(resolvedUdid, textSize);
      }
      if (locale) {
        operationResults.locale = await setLocale(resolvedUdid, locale, region, bundleId);
      }
    }

    const overallSuccess = Object.values(operationResults).every(r => r.success);

    // Build guidance
    if (overallSuccess) {
      guidance.push('Appearance changes applied successfully.');
      if (locale && !bundleId) {
        guidance.push('Restart or re-launch your app to see locale changes take effect.');
      }
      if (locale && RTL_LOCALE_PREFIXES.some(p => locale.startsWith(p))) {
        guidance.push('RTL locale detected — ensure your app supports right-to-left layout.');
      }
    } else {
      guidance.push('One or more appearance operations failed. Check results for details.');
      guidance.push('Ensure the simulator is booted: simctl-device({ operation: "boot" })');
    }

    const responseData = {
      success: overallSuccess,
      udid: resolvedUdid,
      results: operationResults,
      guidance,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(responseData, null, 2),
        },
      ],
      isError: !overallSuccess,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-appearance failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// === DOCUMENTATION ===

export const SIMCTL_APPEARANCE_DOCS = `
# simctl-appearance

Control iOS simulator appearance: theme (light/dark), dynamic type size, locale, and region.

## What it does

Wraps \`xcrun simctl ui\` and \`xcrun simctl spawn defaults write\` to let you switch
appearance settings on a running simulator without leaving your terminal or MCP session.

## Parameters

- **udid** (string, optional): Simulator UDID. Auto-detects booted simulator if omitted.
- **theme** ('light' | 'dark', optional): Switch light/dark appearance.
- **textSize** (string, optional): Dynamic type size alias (XS–AX5, see table below).
- **locale** (string, optional): BCP-47 language code (e.g. \`en\`, \`ar\`, \`de\`).
- **region** (string, optional): ISO 3166-1 alpha-2 region code (e.g. \`US\`, \`SA\`). Requires \`locale\`.
- **bundleId** (string, optional): App bundle ID — terminate + relaunch after locale change. Requires \`locale\`.
- **reset** (boolean, optional): Reset theme, text size, and locale to system defaults (light / M / en_US). Incompatible with other flags.

## Text Size Aliases

| Alias | xcrun token                        |
|-------|------------------------------------|
| XS    | extra-small                        |
| S     | small                              |
| M     | medium (default)                   |
| L     | large                              |
| XL    | extra-large                        |
| XXL   | extra-extra-large                  |
| XXXL  | extra-extra-extra-large            |
| AX1   | accessibility-medium               |
| AX2   | accessibility-large                |
| AX3   | accessibility-extra-large          |
| AX4   | accessibility-extra-extra-large    |
| AX5   | accessibility-extra-extra-extra-large |

## RTL Locales

Locales starting with \`ar\`, \`he\`, \`fa\`, \`ur\`, or \`yi\` are flagged as RTL.
The response includes a \`[RTL layout]\` note and guidance to verify RTL support.

## Returns

JSON response with:
- \`success\`: overall operation success
- \`udid\`: resolved simulator UDID
- \`results\`: per-operation \`{ success, message }\` objects (theme, textSize, locale, or reset)
- \`guidance\`: next-step suggestions

## Examples

### Switch to dark mode
\`\`\`typescript
await simctlAppearanceTool({ theme: 'dark' })
\`\`\`

### Set large dynamic type
\`\`\`typescript
await simctlAppearanceTool({ textSize: 'AX3' })
\`\`\`

### Set Arabic locale (Saudi Arabia) and restart app
\`\`\`typescript
await simctlAppearanceTool({
  locale: 'ar',
  region: 'SA',
  bundleId: 'com.myapp.ios',
})
\`\`\`

### Combine theme and text size
\`\`\`typescript
await simctlAppearanceTool({ theme: 'dark', textSize: 'XL' })
\`\`\`

### Reset all appearance to defaults
\`\`\`typescript
await simctlAppearanceTool({ reset: true })
\`\`\`

## Validation Rules

- At least one of \`theme\`, \`textSize\`, \`locale\`, or \`reset\` must be provided.
- \`reset\` cannot be combined with \`theme\`, \`textSize\`, or \`locale\`.
- \`region\` requires \`locale\`.
- \`bundleId\` requires \`locale\`.

## Important Notes

- The simulator must be booted for commands to succeed.
- Locale changes apply on the next cold app launch unless \`bundleId\` is provided.
- Multiple operations can be combined in a single call (e.g., \`theme\` + \`textSize\`).
`;

export const SIMCTL_APPEARANCE_DOCS_MINI =
  'Control iOS simulator appearance: theme, dynamic type size, locale/region. Use rtfm({ toolName: "simctl-appearance" }) for docs.';
