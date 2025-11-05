import { condenseAppleError, formatToolError } from '../../../src/utils/error-formatter';

describe('error-formatter', () => {
  describe('condenseAppleError', () => {
    it('extracts NSLocalizedFailureReason from Apple error dictionary', () => {
      const error =
        'Simulator device failed to terminate com.example.app.\n' +
        'Info: ["NSLocalizedFailureReason": found nothing to terminate, ' +
        '"NSLocalizedFailure": The request to terminate "com.example.app" failed.]';

      const condensed = condenseAppleError(error);
      expect(condensed).toBe('found nothing to terminate');
    });

    it('handles errors without nested dictionary', () => {
      const error = 'Device is not booted';
      const condensed = condenseAppleError(error);
      expect(condensed).toBe('Device is not booted');
    });

    it('removes Error: prefix from messages', () => {
      const error = 'Error: something went wrong';
      const condensed = condenseAppleError(error);
      expect(condensed).toBe('something went wrong');
    });

    it('removes trailing periods', () => {
      const error = 'Device not found.';
      const condensed = condenseAppleError(error);
      expect(condensed).toBe('Device not found');
    });

    it('returns "Unknown error" for empty input', () => {
      expect(condenseAppleError('')).toBe('Unknown error');
      expect(condenseAppleError(null as any)).toBe('Unknown error');
    });

    it('handles multiline errors by taking first line', () => {
      const error = 'Device not available\nsome other error\nmore details';
      const condensed = condenseAppleError(error);
      expect(condensed).toBe('Device not available');
    });
  });

  describe('formatToolError', () => {
    it('returns default message for empty input', () => {
      expect(formatToolError('')).toBe('Unknown error');
      expect(formatToolError('', 'Custom default')).toBe('Custom default');
    });

    it('condenses error and applies length limit', () => {
      const longError = 'a'.repeat(200);
      const formatted = formatToolError(longError);
      expect(formatted.length).toBeLessThanOrEqual(143); // 140 + '...'
      expect(formatted.endsWith('...')).toBe(true);
    });

    it('preserves short errors without truncation', () => {
      const shortError = 'Device not found';
      const formatted = formatToolError(shortError);
      expect(formatted).toBe('Device not found');
    });

    it('uses custom default message', () => {
      const formatted = formatToolError('', 'Installation failed');
      expect(formatted).toBe('Installation failed');
    });

    it('condenses Apple errors with length limit', () => {
      const error =
        'Simulator device failed to do something.\n' +
        'Info: ["NSLocalizedFailureReason": ' +
        'a'.repeat(200) +
        ', "NSLocalizedFailure": The request failed.]';

      const formatted = formatToolError(error);
      // Should be condensed and limited
      expect(formatted.length).toBeLessThanOrEqual(143); // 140 + '...'
    });
  });
});
