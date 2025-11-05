import {
  escapeShellArg,
  isValidBundleId,
  isSafePath,
  isValidUdid,
} from '../../../src/utils/shell-escape';

describe('shell-escape utilities', () => {
  describe('escapeShellArg', () => {
    it('should wrap simple strings in single quotes', () => {
      expect(escapeShellArg('hello')).toBe("'hello'");
      expect(escapeShellArg('test123')).toBe("'test123'");
    });

    it('should escape single quotes correctly', () => {
      expect(escapeShellArg("it's")).toBe("'it'\\''s'");
      expect(escapeShellArg("don't")).toBe("'don'\\''t'");
    });

    it('should handle empty strings', () => {
      expect(escapeShellArg('')).toBe("''");
    });

    it('should handle strings with multiple single quotes', () => {
      expect(escapeShellArg("'hello' 'world'")).toBe("''\\''hello'\\'' '\\''world'\\'''");
    });

    it('should handle shell metacharacters safely', () => {
      // These should all be wrapped in single quotes and safe
      expect(escapeShellArg('test; rm -rf /')).toBe("'test; rm -rf /'");
      expect(escapeShellArg('$(whoami)')).toBe("'$(whoami)'");
      expect(escapeShellArg('`whoami`')).toBe("'`whoami`'");
      expect(escapeShellArg('$PATH')).toBe("'$PATH'");
    });
  });

  describe('isValidBundleId', () => {
    it('should accept valid bundle IDs', () => {
      expect(isValidBundleId('com.example.app')).toBe(true);
      expect(isValidBundleId('com.example.my-app')).toBe(true);
      expect(isValidBundleId('com.example.my_app')).toBe(true);
      expect(isValidBundleId('io.github.user.app')).toBe(true);
      expect(isValidBundleId('com.company.product.feature')).toBe(true);
    });

    it('should reject invalid bundle IDs', () => {
      expect(isValidBundleId('invalid')).toBe(false); // No dot
      expect(isValidBundleId('com')).toBe(false); // Only one segment
      expect(isValidBundleId('.com.example')).toBe(false); // Starts with dot
      expect(isValidBundleId('com.example.')).toBe(false); // Ends with dot
      expect(isValidBundleId('com..example')).toBe(false); // Double dot
      expect(isValidBundleId('com.example.app!')).toBe(false); // Invalid character
      expect(isValidBundleId('com.example.app;')).toBe(false); // Shell metacharacter
      expect(isValidBundleId('com.example.app|whoami')).toBe(false); // Command injection attempt
    });

    it('should reject bundle IDs with spaces', () => {
      expect(isValidBundleId('com.example.my app')).toBe(false);
      expect(isValidBundleId('com example.app')).toBe(false);
    });

    it('should reject empty bundle IDs', () => {
      expect(isValidBundleId('')).toBe(false);
    });
  });

  describe('isSafePath', () => {
    it('should accept safe absolute paths', () => {
      expect(isSafePath('/Users/test/app.app')).toBe(true);
      expect(isSafePath('/tmp/build/MyApp.ipa')).toBe(true);
      expect(isSafePath('/Applications/MyApp.app')).toBe(true);
    });

    it('should accept safe relative paths', () => {
      expect(isSafePath('./build/app.app')).toBe(true);
      expect(isSafePath('build/MyApp.ipa')).toBe(true);
      expect(isSafePath('MyApp.app')).toBe(true);
    });

    it('should reject paths with path traversal', () => {
      expect(isSafePath('../../../etc/passwd')).toBe(false);
      expect(isSafePath('/tmp/../../../etc/passwd')).toBe(false);
      expect(isSafePath('build/../../../secret')).toBe(false);
    });

    it('should reject paths with null bytes', () => {
      expect(isSafePath('/tmp/file\0.app')).toBe(false);
    });

    it('should reject paths with shell metacharacters', () => {
      expect(isSafePath('/tmp/file; rm -rf /')).toBe(false);
      expect(isSafePath('/tmp/file|whoami')).toBe(false);
      expect(isSafePath('/tmp/file`whoami`')).toBe(false);
      expect(isSafePath('/tmp/file$(whoami)')).toBe(false);
      expect(isSafePath('/tmp/file&background')).toBe(false);
    });

    it('should reject paths starting with dash', () => {
      expect(isSafePath('-rf')).toBe(false);
      expect(isSafePath(' -flag')).toBe(false);
    });

    it('should accept paths with hyphens in names', () => {
      expect(isSafePath('/tmp/my-app.app')).toBe(true);
      expect(isSafePath('./my-build-dir/app.ipa')).toBe(true);
    });
  });

  describe('isValidUdid', () => {
    it('should accept valid UUIDs (simulator UDIDs)', () => {
      expect(isValidUdid('12345678-1234-1234-1234-123456789012')).toBe(true);
      expect(isValidUdid('ABCDEF12-ABCD-ABCD-ABCD-ABCDEFABCDEF')).toBe(true);
      expect(isValidUdid('abcdef12-abcd-abcd-abcd-abcdefabcdef')).toBe(true);
    });

    it('should accept valid device UDIDs (40 hex chars)', () => {
      expect(isValidUdid('0123456789abcdef0123456789abcdef01234567')).toBe(true);
      expect(isValidUdid('ABCDEF0123456789ABCDEF0123456789ABCDEF01')).toBe(true);
    });

    it('should reject invalid UDIDs', () => {
      expect(isValidUdid('invalid-udid')).toBe(false);
      expect(isValidUdid('123')).toBe(false);
      expect(isValidUdid('12345678-1234-1234-1234-12345678901')).toBe(false); // Too short
      expect(isValidUdid('12345678-1234-1234-1234-1234567890123')).toBe(false); // Too long
      expect(isValidUdid('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz')).toBe(false); // Invalid hex
    });

    it('should reject UDIDs with command injection attempts', () => {
      expect(isValidUdid('12345678-1234-1234-1234-123456789012; rm -rf /')).toBe(false);
      expect(isValidUdid('$(whoami)')).toBe(false);
      expect(isValidUdid('`whoami`')).toBe(false);
    });

    it('should reject empty UDIDs', () => {
      expect(isValidUdid('')).toBe(false);
    });
  });

  // 🎉 Test #1000 - Security is priority #1
  describe('🎉 1000th test milestone', () => {
    it('should celebrate comprehensive security validation across all utilities', () => {
      // Test all security functions together
      const validBundleId = 'com.example.secure-app';
      const validPath = '/Users/test/MyApp.app';
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const dangerousInput = "'; rm -rf /; echo '";

      // All valid inputs should pass
      expect(isValidBundleId(validBundleId)).toBe(true);
      expect(isSafePath(validPath)).toBe(true);
      expect(isValidUdid(validUuid)).toBe(true);

      // All dangerous inputs should be rejected
      expect(isValidBundleId(dangerousInput)).toBe(false);
      expect(isSafePath(dangerousInput)).toBe(false);
      expect(isValidUdid(dangerousInput)).toBe(false);

      // Shell escaping should neutralize threats by wrapping in single quotes
      const escaped = escapeShellArg(dangerousInput);
      expect(escaped).toContain("'"); // Wrapped in quotes
      expect(escaped).toBe("''\\''; rm -rf /; echo '\\'''"); // Properly escaped

      // 🎉 1000 tests! Security first!
      expect(true).toBe(true);
    });
  });
});
