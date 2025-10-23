import { simulatorCache, type SimulatorInfo } from '../../../src/state/simulator-cache.js';

// Mock the command execution
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    code: 0,
    stdout: JSON.stringify({
      devices: {
        'iOS 18.5': [
          {
            name: 'iPhone 16 Pro',
            udid: 'device-iphone16pro',
            state: 'Shutdown',
            isAvailable: true,
            availability: '(available)',
            deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro',
            bootHistory: [],
            performanceMetrics: { avgBootTime: 8500, reliability: 0.9 },
          },
          {
            name: 'iPhone 15',
            udid: 'device-iphone15',
            state: 'Shutdown',
            isAvailable: true,
            availability: '(available)',
            deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            bootHistory: [],
            performanceMetrics: { avgBootTime: 9200, reliability: 0.85 },
          },
          {
            name: 'iPad Pro',
            udid: 'device-ipadpro',
            state: 'Shutdown',
            isAvailable: true,
            availability: '(available)',
            deviceTypeIdentifier:
              'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-12-9-6th-generation',
            bootHistory: [],
          },
        ],
      },
      runtimes: [
        {
          name: 'iOS 18.5',
          identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-5',
          version: '18.5',
          isAvailable: true,
          buildversion: '22F5027f',
        },
        {
          name: 'iOS 17.5',
          identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
          version: '17.5',
          isAvailable: true,
          buildversion: '21F5048f',
        },
      ],
      devicetypes: [],
    }),
    stderr: '',
  }),
  buildSimctlCommand: jest.fn(),
}));

describe('SimulatorCache - Scoring & Suggestions', () => {
  beforeEach(async () => {
    simulatorCache.clearCache();
  });

  describe('getSuggestedSimulators', () => {
    it('should return empty array when no simulators available', async () => {
      // Mock empty list
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          devices: {},
          runtimes: [],
          devicetypes: [],
        }),
        stderr: '',
      });

      const suggestions = await simulatorCache.getSuggestedSimulators();
      expect(suggestions).toEqual([]);
    });

    it('should rank simulators by multiple criteria', async () => {
      const suggestions = await simulatorCache.getSuggestedSimulators();

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].score).toBeDefined();
      expect(suggestions[0].reasons).toBeDefined();
      expect(Array.isArray(suggestions[0].reasons)).toBe(true);
    });

    it('should include common device models in scoring', async () => {
      const suggestions = await simulatorCache.getSuggestedSimulators();

      // iPhone 16 Pro is a common model and should rank high
      const iphone16Pro = suggestions.find(s => s.simulator.name === 'iPhone 16 Pro');
      expect(iphone16Pro).toBeDefined();
      expect(iphone16Pro!.reasons.some(r => r.includes('Common model'))).toBe(true);
    });

    it('should prefer faster boot times', async () => {
      const suggestions = await simulatorCache.getSuggestedSimulators();

      // iPhone 16 Pro has faster boot time (8500ms vs 9200ms)
      const iphone16Pro = suggestions.find(s => s.simulator.name === 'iPhone 16 Pro');
      const iphone15 = suggestions.find(s => s.simulator.name === 'iPhone 15');

      expect(iphone16Pro).toBeDefined();
      expect(iphone15).toBeDefined();

      // iPhone 16 Pro should score higher due to boot performance
      expect(iphone16Pro!.score).toBeGreaterThanOrEqual(iphone15!.score);
    });

    it('should respect recent usage priority', async () => {
      // Record usage of iPhone 15
      simulatorCache.recordSimulatorUsage('device-iphone15');

      // Clear and reload cache to see effect
      await simulatorCache.getSimulatorList(true);

      const suggestions = await simulatorCache.getSuggestedSimulators();

      const iphone15 = suggestions.find(s => s.simulator.name === 'iPhone 15');
      expect(iphone15?.reasons.some(r => r.includes('Recently used'))).toBe(true);
    });

    it('should respect project preferences', async () => {
      const projectPath = '/my/project';

      // Record iPhone 15 as preferred for this project
      simulatorCache.recordSimulatorUsage('device-iphone15', projectPath);

      await simulatorCache.getSimulatorList(true);
      const suggestions = await simulatorCache.getSuggestedSimulators(projectPath);

      // iPhone 15 should be top suggestion for this project
      expect(suggestions[0].simulator.udid).toBe('device-iphone15');
      expect(suggestions[0].reasons.some(r => r.includes('Project preference'))).toBe(true);
    });

    it('should support maxSuggestions parameter', async () => {
      const suggestions = await simulatorCache.getSuggestedSimulators(undefined, undefined, 2);

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should filter by device type', async () => {
      const suggestions = await simulatorCache.getSuggestedSimulators(undefined, 'iPhone');

      // All suggestions should be iPhones
      const allIPhones = suggestions.every(s => s.simulator.name.includes('iPhone'));
      expect(allIPhones).toBe(true);
    });
  });

  describe('getBestSimulator', () => {
    it('should return null when no simulators available', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          devices: {},
          runtimes: [],
          devicetypes: [],
        }),
        stderr: '',
      });

      const best = await simulatorCache.getBestSimulator();
      expect(best).toBeNull();
    });

    it('should return best simulator with score and reason', async () => {
      const best = await simulatorCache.getBestSimulator();

      expect(best).not.toBeNull();
      expect(best!.simulator).toBeDefined();
      expect(best!.score).toBeGreaterThan(0);
      expect(best!.reason).toBeDefined();
      expect(typeof best!.reason).toBe('string');
    });

    it('should return project-specific best simulator', async () => {
      const projectPath = '/my/project';

      // Set preference for iPad Pro for this project
      simulatorCache.recordSimulatorUsage('device-ipadpro', projectPath);
      await simulatorCache.getSimulatorList(true);

      const best = await simulatorCache.getBestSimulator(projectPath);

      expect(best!.simulator.udid).toBe('device-ipadpro');
    });

    it('should respect device type filter', async () => {
      const best = await simulatorCache.getBestSimulator(undefined, 'iPad');

      expect(best).not.toBeNull();
      expect(best!.simulator.name).toContain('iPad');
    });
  });

  describe('Scoring algorithm details', () => {
    it('should weight project preference (40%)', async () => {
      const projectPath = '/my/project';

      // Record strong preference for iPhone 15 for this project
      for (let i = 0; i < 5; i++) {
        simulatorCache.recordSimulatorUsage('device-iphone15', projectPath);
      }

      await simulatorCache.getSimulatorList(true);
      const suggestions = await simulatorCache.getSuggestedSimulators(projectPath);

      // Project preference should boost score significantly
      expect(suggestions[0].simulator.udid).toBe('device-iphone15');
    });

    it('should weight recent usage (40%)', async () => {
      // Record recent use of iPhone 16 Pro
      simulatorCache.recordSimulatorUsage('device-iphone16pro');

      await simulatorCache.getSimulatorList(true);
      const suggestions = await simulatorCache.getSuggestedSimulators();

      // Recently used device should rank high
      const iphone16Pro = suggestions.find(s => s.simulator.udid === 'device-iphone16pro');
      expect(iphone16Pro).toBeDefined();
      expect(iphone16Pro!.reasons.some(r => r.includes('Recently'))).toBe(true);
    });

    it('should weight iOS version (30%)', async () => {
      const suggestions = await simulatorCache.getSuggestedSimulators();

      // All suggestions should include iOS version in reasons
      const allHaveVersion = suggestions.every(s => s.reasons.some(r => r.includes('iOS')));
      expect(allHaveVersion).toBe(true);
    });

    it('should weight popular models (20%)', async () => {
      const suggestions = await simulatorCache.getSuggestedSimulators();

      // iPhone 16 Pro should rank high (popular model)
      const iphone16Pro = suggestions.find(s => s.simulator.name === 'iPhone 16 Pro');
      expect(iphone16Pro).toBeDefined();
      expect(iphone16Pro!.reasons.some(r => r.includes('Common model'))).toBe(true);
    });

    it('should weight boot performance (10%)', async () => {
      // Record boot events to populate performance metrics
      await simulatorCache.getSimulatorList();
      simulatorCache.recordBootEvent('device-iphone16pro', true, 8500);
      simulatorCache.recordBootEvent('device-iphone15', true, 9200);

      const suggestions = await simulatorCache.getSuggestedSimulators();

      // Simulators with performance metrics should show boot times
      const withMetrics = suggestions.find(s => s.reasons.some(r => r.includes('Boot')));
      expect(withMetrics).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle simulators with no performance metrics', async () => {
      const suggestions = await simulatorCache.getSuggestedSimulators();

      // iPad Pro has no performance metrics but should still appear
      const ipadPro = suggestions.find(s => s.simulator.name === 'iPad Pro');
      expect(ipadPro).toBeDefined();
      expect(ipadPro!.score).toBeGreaterThan(0);
    });

    it('should handle simulators with zero boot history', async () => {
      const suggestions = await simulatorCache.getSuggestedSimulators();

      // All simulators should be suggested even with zero boot history
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should handle concurrent usage recording', async () => {
      // Record concurrent usage
      await Promise.all([
        Promise.resolve(simulatorCache.recordSimulatorUsage('device-iphone16pro')),
        Promise.resolve(simulatorCache.recordSimulatorUsage('device-iphone15')),
      ]);

      const suggestions = await simulatorCache.getSuggestedSimulators();

      expect(suggestions.length).toBeGreaterThan(0);
      // Both should be in recently used
      const udids = suggestions.map(s => s.simulator.udid);
      expect(udids).toContain('device-iphone16pro');
      expect(udids).toContain('device-iphone15');
    });
  });

  describe('Score consistency', () => {
    it('should provide consistent scores for same input', async () => {
      const suggestions1 = await simulatorCache.getSuggestedSimulators();
      const suggestions2 = await simulatorCache.getSuggestedSimulators();

      // Should get same order and scores
      expect(suggestions1.length).toBe(suggestions2.length);
      for (let i = 0; i < suggestions1.length; i++) {
        expect(suggestions1[i].simulator.udid).toBe(suggestions2[i].simulator.udid);
        expect(suggestions1[i].score).toBe(suggestions2[i].score);
      }
    });

    it('should reflect usage changes in scores', async () => {
      const before = await simulatorCache.getSuggestedSimulators();

      // Record significant usage of different device
      for (let i = 0; i < 10; i++) {
        simulatorCache.recordSimulatorUsage('device-iphone15');
      }

      await simulatorCache.getSimulatorList(true);
      const after = await simulatorCache.getSuggestedSimulators();

      // iPhone 15 should rank higher after heavy usage
      const beforeIPhone15 = before.findIndex(s => s.simulator.udid === 'device-iphone15');
      const afterIPhone15 = after.findIndex(s => s.simulator.udid === 'device-iphone15');

      expect(afterIPhone15).toBeLessThanOrEqual(beforeIPhone15);
    });
  });
});
