/**
 * JSON Parser Utility
 *
 * Handles flexible JSON parsing for formats that might be:
 * - JSON array: [{...}, {...}, {...}] (single line, standard JSON)
 * - NDJSON: {...}\n{...}\n{...} (newline-delimited JSON, one object per line)
 *
 * Why: Different tools return JSON in different formats. IDB returns JSON arrays,
 * while other tools might use NDJSON. This utility handles both transparently.
 */

/**
 * Parse JSON that might be in array or NDJSON format
 *
 * @param text Raw JSON text (array or NDJSON format)
 * @returns Array of parsed JSON objects
 *
 * @example
 * // JSON array format (IDB output)
 * parseFlexibleJson('[{"id":1},{"id":2}]')
 * // Returns: [{id:1}, {id:2}]
 *
 * @example
 * // NDJSON format
 * parseFlexibleJson('{"id":1}\n{"id":2}')
 * // Returns: [{id:1}, {id:2}]
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFlexibleJson(text: string): any[] {
  // Handle empty input
  if (!text || !text.trim()) {
    return [];
  }

  const trimmed = text.trim();

  // Strategy 1: Try parsing as JSON array first (most common for IDB)
  // This handles: [{...}, {...}] or [...]
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // If it's a single object, wrap it in an array
    if (typeof parsed === 'object' && parsed !== null) {
      return [parsed];
    }
  } catch {
    // Not JSON array format, continue to NDJSON
  }

  // Strategy 2: Fall back to NDJSON line-by-line parsing
  // This handles: {...}\n{...}\n{...}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements: any[] = [];
  const lines = trimmed.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      continue;
    }

    try {
      const element = JSON.parse(trimmedLine);
      elements.push(element);
    } catch {
      // Log parse errors but continue processing other lines
      console.error(`[json-parser] Failed to parse line: ${trimmedLine.substring(0, 100)}...`);
    }
  }

  return elements;
}

/**
 * Detect the JSON format of the input text
 *
 * @param text Raw JSON text
 * @returns 'array' | 'ndjson' | 'unknown'
 *
 * @example
 * detectJsonFormat('[{"id":1}]') // Returns: 'array'
 * detectJsonFormat('{"id":1}\n{"id":2}') // Returns: 'ndjson'
 */
export function detectJsonFormat(text: string): 'array' | 'ndjson' | 'single' | 'unknown' {
  if (!text || !text.trim()) {
    return 'unknown';
  }

  const trimmed = text.trim();

  // Try parsing as JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return 'array';
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return 'single';
    }
  } catch {
    // Not standard JSON
  }

  // Check if it looks like NDJSON (multiple lines with JSON objects)
  const lines = trimmed.split('\n').filter(line => line.trim());
  if (lines.length > 1) {
    // Try parsing first line as JSON
    try {
      JSON.parse(lines[0]);
      return 'ndjson';
    } catch {
      // Not valid NDJSON
    }
  }

  return 'unknown';
}
