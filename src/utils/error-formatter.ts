/**
 * Error formatting utilities for token-efficient error responses
 *
 * Condenses verbose Apple framework errors into concise, actionable messages.
 * Parses nested error dictionaries and extracts only the relevant failure reason.
 */

/**
 * Parse and condense Apple error output
 *
 * Apple errors often include deeply nested dictionaries with redundant information.
 * This extracts the core failure reason and filters out noise.
 *
 * Example input:
 * ```
 * Simulator device failed to terminate com.example.app.
 * Info: ["NSLocalizedFailureReason": found nothing to terminate, ...]
 * ```
 *
 * Example output:
 * ```
 * found nothing to terminate
 * ```
 */
export function condenseAppleError(errorOutput: string): string {
  if (!errorOutput) return 'Unknown error';

  // Extract NSLocalizedFailureReason if present (most specific info)
  const reasonMatch = errorOutput.match(/"NSLocalizedFailureReason"\s*:\s*([^,\]]+)/);
  if (reasonMatch) {
    return reasonMatch[1].trim();
  }

  // Extract main error message before nested dict starts
  const mainMessageMatch = errorOutput.match(/^([^[\n]+)/);
  if (mainMessageMatch) {
    const msg = mainMessageMatch[1].trim();
    // Remove trailing period and common prefix
    return msg
      .replace(/\.$/, '')
      .replace(/^Error: /, '')
      .trim();
  }

  // Fallback to first line
  const firstLine = errorOutput.split('\n')[0];
  return firstLine?.trim() || 'Unknown error';
}

/**
 * Format error for LLM response
 *
 * Takes raw stderr and returns a concise error message suitable for MCP tools.
 * Avoids dumping entire error dictionaries while preserving actionable information.
 */
export function formatToolError(stderr: string, defaultMessage: string = 'Unknown error'): string {
  if (!stderr || stderr.trim() === '') {
    return defaultMessage;
  }

  const condensed = condenseAppleError(stderr);

  // Cap message length to prevent token waste
  // Most error messages are actionable in first 140 chars
  const MAX_LENGTH = 140;
  if (condensed.length > MAX_LENGTH) {
    return condensed.substring(0, MAX_LENGTH).trim() + '...';
  }

  return condensed;
}
