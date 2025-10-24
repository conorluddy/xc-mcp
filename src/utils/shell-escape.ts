/**
 * Shell Escaping Utilities
 *
 * Provides safe escaping for shell arguments to prevent command injection.
 * Note: The safest approach is to use spawn with argument arrays instead of shell strings.
 */

/**
 * Escape a string for safe use in a shell command.
 * Wraps the string in single quotes and escapes any single quotes within.
 *
 * This is the POSIX-compliant approach that works on macOS/Linux.
 *
 * @param arg - The argument to escape
 * @returns Safely escaped argument
 */
export function escapeShellArg(arg: string): string {
  // Empty strings need to be represented as ''
  if (arg === '') {
    return "''";
  }

  // Single quote approach: wrap in single quotes and escape any single quotes
  // In POSIX shells, you can't escape a single quote within single quotes,
  // so we close the quote, add an escaped single quote, and reopen
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * Validate that a bundle ID follows the correct format.
 * Bundle IDs should be reverse domain notation (e.g., com.example.myapp).
 *
 * @param bundleId - The bundle ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidBundleId(bundleId: string): boolean {
  // Bundle ID format: reverse domain notation with alphanumeric and hyphens
  // Must have at least one dot, and segments can contain alphanumeric, hyphens, underscores
  const bundleIdPattern = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-_]+)+$/;
  return bundleIdPattern.test(bundleId);
}

/**
 * Validate that a path is safe and doesn't contain path traversal attempts.
 *
 * @param path - The path to validate
 * @returns true if safe, false if potentially dangerous
 */
export function isSafePath(path: string): boolean {
  // Check for path traversal patterns
  if (path.includes('..')) {
    return false;
  }

  // Check for null bytes (common injection technique)
  if (path.includes('\0')) {
    return false;
  }

  // Path should start with / or ./ for absolute/relative paths
  // or be a simple filename
  const dangerousPatterns = [
    /^\s*-/, // Starts with dash (could be interpreted as flag)
    /[;&|`$(){}[\]<>]/, // Shell metacharacters
  ];

  return !dangerousPatterns.some(pattern => pattern.test(path));
}

/**
 * Validate a UDID format (used for iOS simulators and devices).
 * UDIDs should be alphanumeric with hyphens.
 *
 * @param udid - The UDID to validate
 * @returns true if valid, false otherwise
 */
export function isValidUdid(udid: string): boolean {
  // UDID format: alphanumeric with hyphens, typically 36 characters (UUID format)
  // or 40 hex characters for physical devices
  const uuidPattern = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/i;
  const deviceUdidPattern = /^[a-f0-9]{40}$/i;

  return uuidPattern.test(udid) || deviceUdidPattern.test(udid);
}
