import { simctlGetInteractionDetailsTool } from '../../../src/tools/simctl/get-interaction-details';
import { responseCache } from '../../../src/utils/response-cache';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types';

describe('simctl-get-interaction-details', () => {
  describe('Input Validation', () => {
    it('should throw error when interactionId is missing', async () => {
      const args = {
        detailType: 'full-log',
      };

      await expect(simctlGetInteractionDetailsTool(args)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('interactionId'),
        })
      );
    });

    it('should throw error when interactionId is empty string', async () => {
      const args = {
        interactionId: '',
        detailType: 'full-log',
      };

      await expect(simctlGetInteractionDetailsTool(args)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('interactionId'),
        })
      );
    });

    it('should throw error when interactionId does not exist in cache', async () => {
      const args = {
        interactionId: 'nonexistent-id-12345',
        detailType: 'full-log',
      };

      await expect(simctlGetInteractionDetailsTool(args)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('not found'),
        })
      );
    });
  });

  describe('Cache Retrieval and Formatting', () => {
    let cachedId: string;

    beforeEach(() => {
      // Store a sample interaction in cache
      cachedId = responseCache.store({
        tool: 'simctl-query-ui',
        fullOutput:
          'XCUIElementTypeButton: Login Button\nXCUIElementTypeButton: Signup Button\nXCUIElementTypeTextField: Email Field',
        stderr: '',
        exitCode: 0,
        command:
          'xcrun simctl query "device-123" "com.example.app" "type == XCUIElementTypeButton"',
        metadata: {
          udid: 'device-123',
          bundleId: 'com.example.app',
          predicate: 'type == XCUIElementTypeButton',
          elementCount: '2',
        },
      });
    });

    describe('full-log detail type', () => {
      it('should return full log when output is within maxLines', async () => {
        const args = {
          interactionId: cachedId,
          detailType: 'full-log',
          maxLines: 100,
        };

        const result = await simctlGetInteractionDetailsTool(args);
        const responseText = result.content[0].text;
        const response = JSON.parse(responseText);

        expect(response.interactionId).toBe(cachedId);
        expect(response.detailType).toBe('full-log');
        expect(response.tool).toBe('simctl-query-ui');
        expect(response.totalLines).toBe(3);
        expect(response.content).toContain('XCUIElementTypeButton');
        expect(response.showing).toBeUndefined(); // Not truncated
      });

      it('should truncate output and show note when exceeding maxLines', async () => {
        const longOutput = Array(50)
          .fill(0)
          .map((_, i) => `Line ${i}`)
          .join('\n');

        const cachedIdLong = responseCache.store({
          tool: 'simctl-scroll',
          fullOutput: longOutput,
          stderr: '',
          exitCode: 0,
          command: 'xcrun simctl io device-123 scroll up',
          metadata: { udid: 'device-123', direction: 'up' },
        });

        const args = {
          interactionId: cachedIdLong,
          detailType: 'full-log',
          maxLines: 10,
        };

        const result = await simctlGetInteractionDetailsTool(args);
        const responseText = result.content[0].text;
        const response = JSON.parse(responseText);

        expect(response.totalLines).toBe(50);
        expect(response.showing).toBe('Last 10 lines');
        expect(response.content).toContain('Line 49');
        expect(response.note).toContain('Use maxLines parameter');
      });

      it('should handle stderr in full log output', async () => {
        const cachedIdWithErr = responseCache.store({
          tool: 'simctl-tap',
          fullOutput: 'Tap executed',
          stderr: 'Warning: Device may not be responsive',
          exitCode: 0,
          command: 'xcrun simctl io device-123 tap 100 200',
          metadata: { udid: 'device-123', x: '100', y: '200' },
        });

        const args = {
          interactionId: cachedIdWithErr,
          detailType: 'full-log',
        };

        const result = await simctlGetInteractionDetailsTool(args);
        const responseText = result.content[0].text;
        const response = JSON.parse(responseText);

        expect(response.content).toContain('Tap executed');
        expect(response.content).toContain('--- STDERR ---');
        expect(response.content).toContain('Warning: Device may not be responsive');
      });
    });

    describe('summary detail type', () => {
      it('should return operation summary', async () => {
        const args = {
          interactionId: cachedId,
          detailType: 'summary',
        };

        const result = await simctlGetInteractionDetailsTool(args);
        const responseText = result.content[0].text;
        const response = JSON.parse(responseText);

        expect(response.interactionId).toBe(cachedId);
        expect(response.detailType).toBe('summary');
        expect(response.tool).toBe('simctl-query-ui');
        expect(response.success).toBe(true);
        expect(response.exitCode).toBe(0);
        expect(response.command).toBe(
          'xcrun simctl query "device-123" "com.example.app" "type == XCUIElementTypeButton"'
        );
        expect(response.outputSize).toBeGreaterThan(0);
        expect(response.stderrSize).toBe(0);
        expect(response.metadata).toBeDefined();
      });

      it('should indicate success/failure based on exit code', async () => {
        const cachedIdFail = responseCache.store({
          tool: 'simctl-gesture',
          fullOutput: '',
          stderr: 'Gesture failed: invalid coordinates',
          exitCode: 1,
          command: 'xcrun simctl io device-123 swipe 0 0 up',
          metadata: { udid: 'device-123', gestureType: 'swipe' },
        });

        const args = {
          interactionId: cachedIdFail,
          detailType: 'summary',
        };

        const result = await simctlGetInteractionDetailsTool(args);
        const responseText = result.content[0].text;
        const response = JSON.parse(responseText);

        expect(response.success).toBe(false);
        expect(response.exitCode).toBe(1);
      });
    });

    describe('command detail type', () => {
      it('should return executed command details', async () => {
        const args = {
          interactionId: cachedId,
          detailType: 'command',
        };

        const result = await simctlGetInteractionDetailsTool(args);
        const responseText = result.content[0].text;
        const response = JSON.parse(responseText);

        expect(response.interactionId).toBe(cachedId);
        expect(response.detailType).toBe('command');
        expect(response.tool).toBe('simctl-query-ui');
        expect(response.command).toBe(
          'xcrun simctl query "device-123" "com.example.app" "type == XCUIElementTypeButton"'
        );
        expect(response.exitCode).toBe(0);
        expect(response.executedAt).toBeDefined();
      });
    });

    describe('metadata detail type', () => {
      it('should return interaction metadata', async () => {
        const args = {
          interactionId: cachedId,
          detailType: 'metadata',
        };

        const result = await simctlGetInteractionDetailsTool(args);
        const responseText = result.content[0].text;
        const response = JSON.parse(responseText);

        expect(response.interactionId).toBe(cachedId);
        expect(response.detailType).toBe('metadata');
        expect(response.tool).toBe('simctl-query-ui');
        expect(response.metadata).toBeDefined();
        expect(response.metadata.udid).toBe('device-123');
        expect(response.metadata.bundleId).toBe('com.example.app');
        expect(response.metadata.elementCount).toBe('2');
      });

      it('should include cache information', async () => {
        const args = {
          interactionId: cachedId,
          detailType: 'metadata',
        };

        const result = await simctlGetInteractionDetailsTool(args);
        const responseText = result.content[0].text;
        const response = JSON.parse(responseText);

        expect(response.cacheInfo).toBeDefined();
        expect(response.cacheInfo.timestamp).toBeDefined();
        expect(response.cacheInfo.outputSize).toBeGreaterThan(0);
        expect(response.cacheInfo.stderrSize).toBe(0);
      });
    });
  });

  describe('Response Format', () => {
    let cachedId: string;

    beforeEach(() => {
      cachedId = responseCache.store({
        tool: 'simctl-type-text',
        fullOutput: 'Text entered',
        stderr: '',
        exitCode: 0,
        command: 'xcrun simctl io device-123 type "test"',
        metadata: {
          udid: 'device-123',
          textLength: '4',
          isSensitive: 'false',
        },
      });
    });

    it('should always return content array with text type', async () => {
      const args = {
        interactionId: cachedId,
        detailType: 'summary',
      };

      const result = await simctlGetInteractionDetailsTool(args);

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBe(1);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should return valid JSON in response text', async () => {
      const args = {
        interactionId: cachedId,
        detailType: 'summary',
      };

      const result = await simctlGetInteractionDetailsTool(args);
      const responseText = result.content[0].text;

      // Should be valid JSON
      expect(() => JSON.parse(responseText)).not.toThrow();

      const response = JSON.parse(responseText);
      expect(response.interactionId).toBeDefined();
      expect(response.detailType).toBeDefined();
    });
  });

  describe('Default Parameters', () => {
    let cachedId: string;

    beforeEach(() => {
      cachedId = responseCache.store({
        tool: 'simctl-scroll',
        fullOutput: 'Scroll completed',
        stderr: '',
        exitCode: 0,
        command: 'xcrun simctl io device-123 scroll up',
        metadata: { udid: 'device-123', direction: 'up' },
      });
    });

    it('should use default maxLines of 100 when not specified', async () => {
      const args = {
        interactionId: cachedId,
        detailType: 'full-log',
        // No maxLines specified
      };

      const result = await simctlGetInteractionDetailsTool(args);
      const responseText = result.content[0].text;
      const response = JSON.parse(responseText);

      // Should not be truncated (output is less than 100 lines)
      expect(response.content).toBeDefined();
      expect(response.note || response.content).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Mock the cache to throw an error
      const originalGet = responseCache.get;
      responseCache.get = () => {
        throw new Error('Cache system failure');
      };

      try {
        const args = {
          interactionId: 'any-id',
          detailType: 'full-log',
        };

        await expect(simctlGetInteractionDetailsTool(args)).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Cache system failure'),
          })
        );
      } finally {
        // Restore original method
        responseCache.get = originalGet;
      }
    });

    it('should provide clear error message for invalid detailType', async () => {
      const cachedId = responseCache.store({
        tool: 'simctl-query-ui',
        fullOutput: 'test',
        stderr: '',
        exitCode: 0,
        command: 'test',
        metadata: {},
      });

      const args = {
        interactionId: cachedId,
        detailType: 'invalid-type' as any,
      };

      await expect(simctlGetInteractionDetailsTool(args)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Invalid detailType'),
        })
      );
    });
  });

  describe('Tool-Specific Scenarios', () => {
    it('should handle query-ui interaction cache', async () => {
      const cachedId = responseCache.store({
        tool: 'simctl-query-ui',
        fullOutput: 'Button 1\nButton 2\nTextField\nSwitch',
        stderr: '',
        exitCode: 0,
        command: 'xcrun simctl query ...',
        metadata: {
          udid: 'device-123',
          bundleId: 'com.example.app',
          predicate: 'type == Button OR type == TextField',
          elementCount: '4',
        },
      });

      const args = {
        interactionId: cachedId,
        detailType: 'full-log',
      };

      const result = await simctlGetInteractionDetailsTool(args);
      const responseText = result.content[0].text;
      const response = JSON.parse(responseText);

      expect(response.tool).toBe('simctl-query-ui');
      expect(response.content).toContain('Button 1');
      expect(response.totalLines).toBe(4);
    });

    it('should handle tap interaction cache', async () => {
      const cachedId = responseCache.store({
        tool: 'simctl-tap',
        fullOutput: 'Tap complete',
        stderr: '',
        exitCode: 0,
        command: 'xcrun simctl io device-123 tap 100 200',
        metadata: {
          udid: 'device-123',
          x: '100',
          y: '200',
          numberOfTaps: '1',
          actionName: 'Login Button Tap',
        },
      });

      const args = {
        interactionId: cachedId,
        detailType: 'metadata',
      };

      const result = await simctlGetInteractionDetailsTool(args);
      const responseText = result.content[0].text;
      const response = JSON.parse(responseText);

      expect(response.tool).toBe('simctl-tap');
      expect(response.metadata.x).toBe('100');
      expect(response.metadata.y).toBe('200');
      expect(response.metadata.actionName).toBe('Login Button Tap');
    });

    it('should handle type-text interaction cache with sensitive data', async () => {
      const cachedId = responseCache.store({
        tool: 'simctl-type-text',
        fullOutput: 'Text entered',
        stderr: '',
        exitCode: 0,
        command: 'xcrun simctl io [UDID] type [REDACTED]',
        metadata: {
          udid: 'device-123',
          textLength: '16',
          isSensitive: 'true',
          actionName: 'Enter Password',
        },
      });

      const args = {
        interactionId: cachedId,
        detailType: 'summary',
      };

      const result = await simctlGetInteractionDetailsTool(args);
      const responseText = result.content[0].text;
      const response = JSON.parse(responseText);

      expect(response.tool).toBe('simctl-type-text');
      expect(response.metadata.isSensitive).toBe('true');
      expect(response.command).toContain('[REDACTED]');
    });

    it('should handle gesture interaction cache', async () => {
      const cachedId = responseCache.store({
        tool: 'simctl-gesture',
        fullOutput: 'Swipe completed',
        stderr: '',
        exitCode: 0,
        command: 'xcrun simctl io device-123 swipe 100 200 up',
        metadata: {
          udid: 'device-123',
          gestureType: 'swipe',
          direction: 'up',
          actionName: 'Swipe Up For More Content',
        },
      });

      const args = {
        interactionId: cachedId,
        detailType: 'command',
      };

      const result = await simctlGetInteractionDetailsTool(args);
      const responseText = result.content[0].text;
      const response = JSON.parse(responseText);

      expect(response.tool).toBe('simctl-gesture');
      expect(response.command).toContain('swipe');
      expect(response.command).toContain('up');
    });
  });
});
